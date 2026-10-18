import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expectApiError } from '../helpers/assertions.js';
import { createTestContext } from '../helpers/test-context.js';

const context = await createTestContext();
const { app, prisma } = context;
const { config } = await import('../../src/config/env.js');
const requestTimeout = { response: 10_000, deadline: 12_000 };

afterAll(async () => context.close());
beforeEach(async () => context.reset());

async function createProduct(id: string, stock: number, priceCents = 1000) {
    await prisma.product.create({ data: { id, name: id, priceCents, stock } });
}

async function createCartWithItems(items: Array<{ productId: string; quantity?: number }>) {
    const cart = await request(app).post('/carts');
    expect(cart.status).toBe(201);
    for (const item of items) {
        const added = await request(app)
            .put(`/carts/${cart.body.id}/items/${item.productId}`)
            .send({ quantity: item.quantity ?? 1 });
        expect(added.status).toBe(200);
    }
    return cart.body.id as string;
}

async function placeOrders(count: number) {
    await createProduct('milestone-product', count + 10);
    for (let index = 0; index < count; index += 1) {
        const cartId = await createCartWithItems([{ productId: 'milestone-product' }]);
        const order = await request(app).post(`/carts/${cartId}/checkout`).send({});
        expect(order.status).toBe(201);
    }
}

describe('competing checkout requests', () => {
    it('reserves limited stock exactly once across ten different carts', async () => {
        await createProduct('limited-stock', 3);
        const cartIds = await Promise.all(
            Array.from({ length: 10 }, () => createCartWithItems([{ productId: 'limited-stock' }])),
        );

        const responses = await Promise.all(
            cartIds.map((cartId) =>
                request(app).post(`/carts/${cartId}/checkout`).send({}).timeout(requestTimeout),
            ),
        );

        expect(responses.filter((response) => response.status === 201)).toHaveLength(3);
        const stockErrors = responses.filter((response) => response.status !== 201);
        expect(stockErrors).toHaveLength(7);
        for (const response of stockErrors) {
            expectApiError(response, 409, 'INSUFFICIENT_STOCK');
        }
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'limited-stock' } })).toMatchObject({
            stock: 0,
        });
        expect(await prisma.order.count()).toBe(3);
    });

    it('does not deadlock when two carts reserve the same products in opposite orders', async () => {
        await createProduct('product-a', 1);
        await createProduct('product-b', 1);
        const [firstCart, secondCart] = await Promise.all([
            createCartWithItems([{ productId: 'product-a' }, { productId: 'product-b' }]),
            createCartWithItems([{ productId: 'product-b' }, { productId: 'product-a' }]),
        ]);

        const responses = await Promise.all(
            [firstCart, secondCart].map((cartId) =>
                request(app).post(`/carts/${cartId}/checkout`).send({}).timeout(requestTimeout),
            ),
        );

        expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
        const stockErrors = responses.filter((response) => response.status !== 201);
        expect(stockErrors).toHaveLength(1);
        expectApiError(stockErrors[0], 409, 'INSUFFICIENT_STOCK');
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'product-a' } })).toMatchObject({ stock: 0 });
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'product-b' } })).toMatchObject({ stock: 0 });
        expect(await prisma.order.count()).toBe(1);
    });

    it('makes five concurrent and later sequential checkouts replay one order', async () => {
        await createProduct('idempotent', 8);
        const cartId = await createCartWithItems([{ productId: 'idempotent', quantity: 2 }]);

        const concurrent = await Promise.all(
            Array.from({ length: 5 }, () =>
                request(app).post(`/carts/${cartId}/checkout`).send({}).timeout(requestTimeout),
            ),
        );
        const sequential = await Promise.all(
            Array.from({ length: 3 }, () => request(app).post(`/carts/${cartId}/checkout`).send({})),
        );
        const responses = [...concurrent, ...sequential];

        expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
        expect(responses.filter((response) => response.status === 200)).toHaveLength(7);
        expect(responses.filter((response) => response.body.replayed === false)).toHaveLength(1);
        expect(responses.filter((response) => response.body.replayed === true)).toHaveLength(7);
        expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
        expect(responses.every((response) => response.body.price.subtotalCents === 2000)).toBe(true);
        expect(responses.every((response) => response.body.price.totalCents === 2000)).toBe(true);
        expect(await prisma.order.count()).toBe(1);
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'idempotent' } })).toMatchObject({ stock: 6 });
        expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({
            status: 'CHECKED_OUT',
        });
    });

    it('redeems a coupon exactly once when different carts race to use it', async () => {
        await createProduct('coupon-stock', 2);
        const coupon = await prisma.coupon.create({
            data: { code: 'ONE-USE', milestone: 1, discountPercent: 10 },
        });
        const cartIds = await Promise.all([
            createCartWithItems([{ productId: 'coupon-stock' }]),
            createCartWithItems([{ productId: 'coupon-stock' }]),
        ]);

        const responses = await Promise.all(
            cartIds.map((cartId) =>
                request(app)
                    .post(`/carts/${cartId}/checkout`)
                    .send({ couponCode: coupon.code })
                    .timeout(requestTimeout),
            ),
        );

        expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
        const redemptionErrors = responses.filter((response) => response.status !== 201);
        expect(redemptionErrors).toHaveLength(1);
        expectApiError(redemptionErrors[0], 409, 'COUPON_ALREADY_REDEEMED');
        expect(await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
            status: 'REDEEMED',
        });
        expect(await prisma.order.count({ where: { couponId: coupon.id } })).toBe(1);
    });
});

describe('competing cart writes and coupon generation', () => {
    it('serializes cart item writes with checkout so order and cart snapshots cannot diverge', async () => {
        await createProduct('mutation-checkout-race', 30);
        const cartId = await createCartWithItems([{ productId: 'mutation-checkout-race' }]);

        const [mutations, firstCheckout] = await Promise.all([
            Promise.all(
                Array.from({ length: 12 }, (_, index) =>
                    request(app)
                        .put(`/carts/${cartId}/items/mutation-checkout-race`)
                        .send({ quantity: index + 1 })
                        .timeout(requestTimeout),
                ),
            ),
            request(app).post(`/carts/${cartId}/checkout`).send({}).timeout(requestTimeout),
        ]);

        for (const mutation of mutations) {
            if (mutation.status === 200) continue;
            if (mutation.status === 409) {
                expectApiError(mutation, 409, 'CART_ALREADY_CHECKED_OUT');
                continue;
            }
            expectApiError(mutation, 503, 'SERVICE_BUSY');
        }

        const checkout =
            firstCheckout.status === 503
                ? await request(app).post(`/carts/${cartId}/checkout`).send({}).timeout(requestTimeout)
                : firstCheckout;
        expect(checkout.status).toBe(201);
        const cart = await request(app).get(`/carts/${cartId}`);
        expect(cart.status).toBe(200);
        expect(cart.body.status).toBe('CHECKED_OUT');
        expect(cart.body.items).toHaveLength(1);
        expect(checkout.body.items[0].quantity).toBe(cart.body.items[0].quantity);
        expect(await prisma.order.count({ where: { cartId } })).toBe(1);
    });

    it('upserts concurrent PUTs into one CartItem row', async () => {
        await createProduct('put-race', 100);
        const cartId = await createCartWithItems([]);
        const responses = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                request(app)
                    .put(`/carts/${cartId}/items/put-race`)
                    .send({ quantity: index + 1 })
                    .timeout(requestTimeout),
            ),
        );

        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(await prisma.cartItem.count({ where: { cartId, productId: 'put-race' } })).toBe(1);
        expect(await prisma.cartItem.findUniqueOrThrow({
            where: { cartId_productId: { cartId, productId: 'put-race' } },
        })).toMatchObject({ quantity: expect.any(Number) });
    });

    it('creates only one coupon for five concurrent requests at an eligible milestone', async () => {
        await placeOrders(config.couponEveryNOrders);
        const responses = await Promise.all(
            Array.from({ length: 5 }, () =>
                request(app).post('/admin/coupons/generate').send({}).timeout(requestTimeout),
            ),
        );

        expect(responses.some((response) => response.status === 201)).toBe(true);
        expect(responses.every((response) => [201, 409].includes(response.status))).toBe(true);
        expect(
            responses
                .filter((response) => response.status === 201)
                .every((response) => response.body.id === responses.find((result) => result.status === 201)?.body.id),
        ).toBe(true);
        for (const response of responses.filter((result) => result.status === 409)) {
            expectApiError(response, 409, 'NO_ELIGIBLE_MILESTONE');
        }
        expect(await prisma.coupon.count()).toBe(1);
    });

    it('issues milestones sequentially for 2n orders and then reports no eligible milestone', async () => {
        await placeOrders(2 * config.couponEveryNOrders);

        const first = await request(app).post('/admin/coupons/generate').send({});
        const second = await request(app).post('/admin/coupons/generate').send({});
        const third = await request(app).post('/admin/coupons/generate').send({});

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.milestone).toBe(1);
        expect(second.body.milestone).toBe(2);
        expect(third.status).toBe(409);
        expectApiError(third, 409, 'NO_ELIGIBLE_MILESTONE');
        expect(await prisma.coupon.count()).toBe(2);
    });

    it('keeps coupon counts consistent while redemption races with generation', async () => {
        await placeOrders(2 * config.couponEveryNOrders - 1);
        const generated = await request(app).post('/admin/coupons/generate').send({});
        expect(generated.status).toBe(201);
        const cartId = await createCartWithItems([{ productId: 'milestone-product' }]);

        const [checkout, generation] = await Promise.all([
            request(app)
                .post(`/carts/${cartId}/checkout`)
                .send({ couponCode: generated.body.code })
                .timeout(requestTimeout),
            request(app).post('/admin/coupons/generate').send({}).timeout(requestTimeout),
        ]);

        expect(checkout.status).toBe(201);
        expect([201, 409]).toContain(generation.status);
        if (generation.status === 201) {
            expect(generation.body.milestone).toBe(2);
        } else {
            expectApiError(generation, 409, 'NO_ELIGIBLE_MILESTONE');
        }
        const report = await request(app).get('/admin/report');
        const generatedCount = 1 + (generation.status === 201 ? 1 : 0);
        expect(report.body.coupons).toMatchObject({
            generated: generatedCount,
            available: generatedCount - 1,
            redeemed: 1,
        });
        expect(report.body.coupons.generated).toBe(report.body.coupons.available + report.body.coupons.redeemed);
        expect(await prisma.order.count({ where: { couponId: generated.body.id } })).toBe(1);
    });
});
