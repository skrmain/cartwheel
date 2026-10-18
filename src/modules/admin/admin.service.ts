import { randomBytes } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/env.js';
import { NoEligibleMilestoneError, PaymentFailedError } from '../../shared/errors/app-error.js';

function generateCouponCode() {
    return `SAVE-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export const adminService = {
    async generateCoupons(_input: { count?: number }) {
        const n = config.couponEveryNOrders;
        const x = config.couponDiscountPercent;

        return prisma.$transaction(
            async (tx) => {
                const totalOrders = await tx.order.count({ where: { status: 'PLACED' } });
                const eligibleMilestones = Math.floor(totalOrders / n);
                const maxCoupon = await tx.coupon.aggregate({
                    _max: { milestone: true },
                });
                const rewardedMilestones = maxCoupon._max.milestone ?? 0;

                if (eligibleMilestones <= rewardedMilestones) {
                    throw new NoEligibleMilestoneError({
                        totalOrders,
                        n,
                        rewardedMilestones,
                        eligibleMilestones,
                    });
                }

                const milestone = rewardedMilestones + 1;
                const code = generateCouponCode();

                try {
                    const coupon = await tx.coupon.create({
                        data: {
                            code,
                            milestone,
                            discountPercent: x,
                            status: 'AVAILABLE',
                        },
                    });

                    return {
                        id: coupon.id,
                        code: coupon.code,
                        milestone: coupon.milestone,
                        discountPercent: coupon.discountPercent,
                        status: coupon.status,
                        createdAt: coupon.createdAt.toISOString(),
                    };
                } catch (error: any) {
                    if (error?.code === 'P2002') {
                        const existingCoupon = await tx.coupon.findUnique({
                            where: { milestone },
                        });
                        if (existingCoupon) {
                            return {
                                id: existingCoupon.id,
                                code: existingCoupon.code,
                                milestone: existingCoupon.milestone,
                                discountPercent: existingCoupon.discountPercent,
                                status: existingCoupon.status,
                                createdAt: existingCoupon.createdAt.toISOString(),
                            };
                        }
                    }

                    throw new NoEligibleMilestoneError({
                        totalOrders,
                        n,
                        rewardedMilestones,
                        eligibleMilestones,
                    });
                }
            },
            { timeout: 15000, maxWait: 15000 },
        );
    },

    async listCoupons() {
        const coupons = await prisma.coupon.findMany({
            orderBy: { milestone: 'asc' },
            include: { order: true },
        });

        return coupons.map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            milestone: coupon.milestone,
            discountPercent: coupon.discountPercent,
            status: coupon.status,
            redeemedAt: coupon.redeemedAt ? coupon.redeemedAt.toISOString() : null,
            orderId: coupon.order?.id ?? null,
        }));
    },

    async listOrders() {
        const orders = await prisma.order.findMany({
            orderBy: { createdAt: 'desc' },
            include: { items: true, coupon: true },
        });

        return orders.map((order) => ({
            id: order.id,
            cartId: order.cartId,
            status: order.status,
            subtotalCents: order.subtotalCents,
            discountCents: order.discountCents,
            totalCents: order.totalCents,
            couponCode: order.couponCode,
            couponPercent: order.couponPercent,
            paymentRef: order.paymentRef,
            createdAt: order.createdAt.toISOString(),
            items: order.items.map((item) => ({
                id: item.id,
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                lineTotalCents: item.lineTotalCents,
            })),
        }));
    },

    async getReport() {
        return prisma.$transaction(
            async (tx) => {
                const orders = await tx.order.findMany({
                    include: { items: true },
                });

                const quantityByProduct = Object.values(
                    orders.reduce<Record<string, { productId: string; productName: string; quantity: number }>>(
                        (acc, order) => {
                            for (const item of order.items) {
                                const key = item.productId;
                                const existing = acc[key] ?? {
                                    productId: item.productId,
                                    productName: item.productName,
                                    quantity: 0,
                                };
                                existing.quantity += item.quantity;
                                acc[key] = existing;
                            }
                            return acc;
                        },
                        {},
                    ),
                );

                const grossRevenueCents = orders.reduce((sum, order) => sum + order.subtotalCents, 0);
                const totalDiscountCents = orders.reduce((sum, order) => sum + order.discountCents, 0);
                const netRevenueCents = orders.reduce((sum, order) => sum + order.totalCents, 0);

                const [generated, available, redeemed] = await Promise.all([
                    tx.coupon.count(),
                    tx.coupon.count({ where: { status: 'AVAILABLE' } }),
                    tx.coupon.count({ where: { status: 'REDEEMED' } }),
                ]);

                return {
                    totalOrders: orders.length,
                    quantityByProduct,
                    grossRevenueCents,
                    totalDiscountCents,
                    netRevenueCents,
                    coupons: { generated, available, redeemed },
                };
            },
            { timeout: 15000, maxWait: 15000 },
        );
    },
};
