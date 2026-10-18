import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError } from '../helpers/assertions.js';
import { createTestContext } from '../helpers/test-context.js';

const context = await createTestContext();
const { app, prisma } = context;

afterAll(async () => context.close());
beforeEach(async () => context.reset());

async function createProduct(id: string, priceCents = 1000, stock = 10) {
    return prisma.product.create({
        data: { id, name: `Product ${id}`, priceCents, stock },
    });
}

async function createCart() {
    const response = await request(app).post('/carts');
    expect(response.status).toBe(201);
    return response.body.id as string;
}

async function addItem(cartId: string, productId: string, quantity: unknown = 1) {
    return request(app).put(`/carts/${cartId}/items/${productId}`).send({ quantity });
}

describe('API contracts and cart validation', () => {
    it('serves health and products, and formats unknown-route and malformed-JSON errors', async () => {
        await createProduct('health-product');

        const health = await request(app).get('/health');
        expect(health.status).toBe(200);
        expect(health.body).toEqual({ status: 'ok' });
        const products = await request(app).get('/products');
        expect(products.status).toBe(200);
        expect(products.body.map((product: { id: string }) => product.id)).toEqual(['health-product']);

        expectApiError(await request(app).get('/does-not-exist'), 404, 'NOT_FOUND');

        const malformedJson = await request(app)
            .post('/carts')
            .set('Content-Type', 'application/json')
            .send('{"quantity":');
        expectApiError(malformedJson, 400, 'INVALID_JSON');
    });

    it('distinguishes missing products, invalid quantities, and requests above stock', async () => {
        await createProduct('limited', 1000, 2);
        const cartId = await createCart();

        expectApiError(await addItem(cartId, 'missing'), 404, 'PRODUCT_NOT_FOUND');
        for (const quantity of [0, -1, 1.5, '1', 101]) {
            expectApiError(await addItem(cartId, 'limited', quantity), 400, 'VALIDATION_ERROR');
        }
        expectApiError(await addItem(cartId, 'limited', 3), 409, 'INSUFFICIENT_STOCK');
    });

    it('rejects mutations to checked-out carts with a distinct error code', async () => {
        await createProduct('locked-cart');
        const cartId = await createCart();
        expect((await addItem(cartId, 'locked-cart')).status).toBe(200);
        expect((await request(app).post(`/carts/${cartId}/checkout`).send({})).status).toBe(201);

        expectApiError(await addItem(cartId, 'locked-cart', 2), 409, 'CART_ALREADY_CHECKED_OUT');
        expectApiError(
            await request(app).delete(`/carts/${cartId}/items/locked-cart`),
            409,
            'CART_ALREADY_CHECKED_OUT',
        );
    });
});

describe('checkout price and snapshot behavior', () => {
    it('reports price changes, rolls back stale-total checkout, and charges the current price if no total is supplied', async () => {
        await createProduct('price-change', 1000, 4);
        const cartId = await createCart();
        expect((await addItem(cartId, 'price-change', 2)).status).toBe(200);
        await prisma.product.update({ where: { id: 'price-change' }, data: { priceCents: 1500 } });

        const cart = await request(app).get(`/carts/${cartId}`);
        expect(cart.body.items[0]).toMatchObject({ priceChanged: true, unitPriceCents: 1500 });
        expect(cart.body.warnings).toContain('PRICE_CHANGED:price-change');

        const stale = await request(app)
            .post(`/carts/${cartId}/checkout`)
            .send({ expectedTotalCents: 2000 });
        expectApiError(stale, 409, 'PRICE_CHANGED');
        expect(stale.body.error.details).toMatchObject({ oldTotalCents: 2000, newTotalCents: 3000 });
        expect(stale.body.error.details.itemChanges).toHaveLength(1);
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'price-change' } })).toMatchObject({
            stock: 4,
        });
        expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({ status: 'OPEN' });
        expect(await prisma.order.count()).toBe(0);

        const fresh = await request(app).post(`/carts/${cartId}/checkout`).send({});
        expect(fresh.status).toBe(201);
        expect(fresh.body.totalCents).toBe(3000);
    });

    it('serves the immutable order snapshot after its product changes', async () => {
        await createProduct('snapshot', 2200, 5);
        const cartId = await createCart();
        await addItem(cartId, 'snapshot', 2);
        const checkout = await request(app).post(`/carts/${cartId}/checkout`).send({});
        const original = await request(app).get(`/orders/${checkout.body.id}`);

        await prisma.product.update({
            where: { id: 'snapshot' },
            data: { name: 'Changed name', priceCents: 1, stock: 99 },
        });
        const afterProductChange = await request(app).get(`/orders/${checkout.body.id}`);
        expect(afterProductChange.body).toEqual(original.body);
        expect(original.body.items[0]).toMatchObject({
            productName: 'Product snapshot',
            unitPriceCents: 2200,
            quantity: 2,
            lineTotalCents: 4400,
        });
    });
});

describe('coupon rollback behavior', () => {
    async function createCoupon(code: string, discountPercent = 10) {
        return prisma.coupon.create({
            data: { code, milestone: 1, discountPercent, status: 'AVAILABLE' },
        });
    }

    it('keeps a coupon and stock available after payment failure, then allows retry', async () => {
        await createProduct('payment-failure', 1000, 3);
        const coupon = await createCoupon('PAYMENT10');
        const cartId = await createCart();
        await addItem(cartId, 'payment-failure');
        const { FakePaymentGateway } = await import('../../src/modules/payment/payment.gateway.js');
        const charge = vi.spyOn(FakePaymentGateway.prototype, 'charge').mockRejectedValueOnce(new Error('failed'));

        try {
            expectApiError(
                await request(app).post(`/carts/${cartId}/checkout`).send({ couponCode: coupon.code }),
                402,
                'PAYMENT_FAILED',
            );
        } finally {
            charge.mockRestore();
        }

        expect(await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
            status: 'AVAILABLE',
            redeemedAt: null,
        });
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'payment-failure' } })).toMatchObject({
            stock: 3,
        });
        expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({ status: 'OPEN' });
        expect((await request(app).post(`/carts/${cartId}/checkout`).send({ couponCode: coupon.code })).status).toBe(
            201,
        );
    });

    it('keeps a coupon available on insufficient stock and succeeds after stock is replenished', async () => {
        await createProduct('stock-failure', 1000, 2);
        const coupon = await createCoupon('STOCK10');
        const cartId = await createCart();
        await addItem(cartId, 'stock-failure', 2);
        await prisma.product.update({ where: { id: 'stock-failure' }, data: { stock: 1 } });

        expectApiError(
            await request(app).post(`/carts/${cartId}/checkout`).send({ couponCode: coupon.code }),
            409,
            'INSUFFICIENT_STOCK',
        );
        expect(await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
            status: 'AVAILABLE',
        });
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'stock-failure' } })).toMatchObject({
            stock: 1,
        });
        expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({ status: 'OPEN' });

        await prisma.product.update({ where: { id: 'stock-failure' }, data: { stock: 2 } });
        expect(
            (await request(app).post(`/carts/${cartId}/checkout`).send({ couponCode: coupon.code })).status,
        ).toBe(201);
    });

    it('keeps a coupon available on stale expected total and succeeds on retry', async () => {
        await createProduct('stale-coupon', 1000, 3);
        const coupon = await createCoupon('STALE10');
        const cartId = await createCart();
        await addItem(cartId, 'stale-coupon');
        await prisma.product.update({ where: { id: 'stale-coupon' }, data: { priceCents: 2000 } });

        expectApiError(
            await request(app)
                .post(`/carts/${cartId}/checkout`)
                .send({ couponCode: coupon.code, expectedTotalCents: 900 }),
            409,
            'PRICE_CHANGED',
        );
        expect(await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
            status: 'AVAILABLE',
        });
        expect(await prisma.product.findUniqueOrThrow({ where: { id: 'stale-coupon' } })).toMatchObject({
            stock: 3,
        });
        expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({ status: 'OPEN' });

        const retry = await request(app).post(`/carts/${cartId}/checkout`).send({ couponCode: coupon.code });
        expect(retry.status).toBe(201);
        expect(retry.body).toMatchObject({ subtotalCents: 2000, discountCents: 200, totalCents: 1800 });
    });

    it('applies a 100 percent coupon once and never produces a negative total', async () => {
        await createProduct('free-order', 3333, 3);
        const coupon = await createCoupon('FREE-ORDER', 100);
        const cartId = await createCart();
        await addItem(cartId, 'free-order', 3);

        const checkout = await request(app)
            .post(`/carts/${cartId}/checkout`)
            .send({ couponCode: coupon.code });

        expect(checkout.status).toBe(201);
        expect(checkout.body).toMatchObject({
            subtotalCents: 9999,
            discountCents: 9999,
            totalCents: 0,
        });
        expect(checkout.body.totalCents).toBeGreaterThanOrEqual(0);
    });

    it('calculates a percentage once from the combined item subtotal in integer cents', async () => {
        await createProduct('subtotal-rounding', 1997, 3);
        const coupon = await createCoupon('SUBTOTAL10', 10);
        const cartId = await createCart();
        await addItem(cartId, 'subtotal-rounding', 3);

        const checkout = await request(app)
            .post(`/carts/${cartId}/checkout`)
            .send({ couponCode: coupon.code });

        expect(checkout.status).toBe(201);
        expect(checkout.body).toMatchObject({
            subtotalCents: 5991,
            discountCents: 599,
            totalCents: 5392,
        });
    });
});
