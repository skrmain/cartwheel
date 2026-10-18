import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expectApiError } from '../helpers/assertions.js';
import { createTestContext } from '../helpers/test-context.js';

const context = await createTestContext();
const { app, prisma } = context;
const { config } = await import('../../src/config/env.js');

afterAll(async () => context.close());
beforeEach(async () => context.reset());

async function createProduct(id: string, stock: number, priceCents = 1000) {
    await prisma.product.create({ data: { id, name: id, priceCents, stock } });
}

async function placeOrder(productId: string, couponCode?: string) {
    const cart = await request(app).post('/carts');
    const item = await request(app)
        .put(`/carts/${cart.body.id}/items/${productId}`)
        .send({ quantity: 1 });
    expect(item.status).toBe(200);
    const order = await request(app)
        .post(`/carts/${cart.body.id}/checkout`)
        .send(couponCode ? { couponCode } : {});
    expect(order.status).toBe(201);
    return order.body;
}

async function databaseSnapshot() {
    const [products, carts, cartItems, coupons, orders, orderItems] = await Promise.all([
        prisma.product.findMany({ orderBy: { id: 'asc' } }),
        prisma.cart.findMany({ orderBy: { id: 'asc' } }),
        prisma.cartItem.findMany({ orderBy: { id: 'asc' } }),
        prisma.coupon.findMany({ orderBy: { id: 'asc' } }),
        prisma.order.findMany({ orderBy: { id: 'asc' } }),
        prisma.orderItem.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return { products, carts, cartItems, coupons, orders, orderItems };
}

describe('admin report reconciliation', () => {
    it('reconciles mixed successful and failed checkouts without mutating state', async () => {
        const milestone = config.couponEveryNOrders;
        await createProduct('report-a', milestone + 4, 1999);
        await createProduct('report-b', milestone + 4, 3333);
        for (let index = 0; index < milestone; index += 1) {
            await placeOrder(index % 2 === 0 ? 'report-a' : 'report-b');
        }
        const generated = await request(app).post('/admin/coupons/generate').send({});
        expect(generated.status).toBe(201);

        const discountedOrder = await placeOrder('report-a', generated.body.code);
        await createProduct('report-c', 3, 800);
        const failedCart = await request(app).post('/carts');
        await request(app).put(`/carts/${failedCart.body.id}/items/report-c`).send({ quantity: 1 });
        const failed = await request(app)
            .post(`/carts/${failedCart.body.id}/checkout`)
            .send({ expectedTotalCents: 799 });
        expectApiError(failed, 409, 'PRICE_CHANGED');
        const recovered = await request(app).post(`/carts/${failedCart.body.id}/checkout`).send({});
        expect(recovered.status).toBe(201);

        const orders = await request(app).get('/admin/orders');
        const coupons = await request(app).get('/admin/coupons');
        const beforeReports = await databaseSnapshot();
        const firstReport = await request(app).get('/admin/report');
        const afterFirstReport = await databaseSnapshot();
        const secondReport = await request(app).get('/admin/report');
        const afterSecondReport = await databaseSnapshot();

        expect(orders.status).toBe(200);
        expect(coupons.status).toBe(200);
        expect(firstReport.status).toBe(200);
        expect(secondReport.body).toEqual(firstReport.body);
        expect(afterFirstReport).toEqual(beforeReports);
        expect(afterSecondReport).toEqual(beforeReports);

        const orderRows = orders.body as Array<{
            subtotalCents: number;
            discountCents: number;
            totalCents: number;
            items: Array<{ productId: string; quantity: number }>;
        }>;
        const gross = orderRows.reduce((sum, order) => sum + order.subtotalCents, 0);
        const discounts = orderRows.reduce((sum, order) => sum + order.discountCents, 0);
        const net = orderRows.reduce((sum, order) => sum + order.totalCents, 0);
        const quantities = new Map<string, number>();
        for (const order of orderRows) {
            for (const item of order.items) {
                quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
            }
        }
        const reportQuantities = new Map(
            (firstReport.body.quantityByProduct as Array<{ productId: string; quantity: number }>).map((item) => [
                item.productId,
                item.quantity,
            ]),
        );

        expect(firstReport.body).toMatchObject({
            totalOrders: orderRows.length,
            grossRevenueCents: gross,
            totalDiscountCents: discounts,
            netRevenueCents: net,
            coupons: { generated: coupons.body.length },
        });
        expect(gross - discounts).toBe(net);
        expect(reportQuantities).toEqual(quantities);
        expect(firstReport.body.coupons.generated).toBe(
            firstReport.body.coupons.available + firstReport.body.coupons.redeemed,
        );
        expect(coupons.body.find((coupon: { id: string }) => coupon.id === generated.body.id)).toMatchObject({
            status: 'REDEEMED',
            orderId: discountedOrder.id,
        });
    });
});
