import { prisma } from '../../db/prisma.js';
import {
    CartAlreadyCheckedOutError,
    CartNotFoundError,
    CouponAlreadyRedeemedError,
    CouponInvalidFormatError,
    CouponNotFoundError,
    EmptyCartError,
    InsufficientStockError,
    InvalidQuantityError,
    ItemNotInCartError,
    OrderNotFoundError,
    PaymentFailedError,
    PriceChangedError,
    ProductNotFoundError,
} from '../../shared/errors/app-error.js';
import { lineTotal, percentDiscount } from '../../shared/utils/money.js';
import { FakePaymentGateway, type PaymentGateway } from '../payment/payment.gateway.js';
import { productRepository } from '../product/product.repository.js';
import { cartRepository } from './cart.repository.js';

function buildCartView(cart: Awaited<ReturnType<typeof cartRepository.findById>>) {
    if (!cart) {
        throw new CartNotFoundError();
    }

    const items = cart.items.map((item) => {
        const currentPrice = item.product.priceCents;
        const lineTotalCents = lineTotal(currentPrice, item.quantity);
        const priceChanged = item.unitPriceCentsAtAdd !== currentPrice;
        const stockWarning = item.product.stock < item.quantity;

        return {
            productId: item.productId,
            name: item.product.name,
            quantity: item.quantity,
            unitPriceCents: currentPrice,
            unitPriceCentsAtAdd: item.unitPriceCentsAtAdd,
            priceChanged,
            lineTotalCents,
            availableStock: item.product.stock,
            stockWarning,
        };
    });

    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const warnings = [
        ...items.filter((item) => item.priceChanged).map((item) => `PRICE_CHANGED:${item.productId}`),
        ...items.filter((item) => item.stockWarning).map((item) => `LOW_STOCK:${item.productId}`),
    ];

    return {
        id: cart.id,
        status: cart.status,
        items,
        subtotalCents,
        warnings,
    };
}

function buildOrderSnapshot(order: any, replayed = false) {
    const items = (order.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
    }));

    return {
        id: order.id,
        cartId: order.cartId,
        status: order.status,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        couponId: order.couponId,
        couponCode: order.couponCode,
        couponPercent: order.couponPercent,
        paymentRef: order.paymentRef,
        createdAt: order.createdAt,
        items,
        replayed,
    };
}

export const cartService = {
    async createCart() {
        const cart = await cartRepository.create();
        return {
            id: cart.id,
            status: cart.status,
            items: [],
            subtotalCents: 0,
            warnings: [],
        };
    },

    async getCart(cartId: string) {
        const cart = await cartRepository.findById(cartId);
        if (!cart) {
            throw new CartNotFoundError(cartId);
        }
        return buildCartView(cart);
    },

    async updateItem(cartId: string, productId: string, quantity: number) {
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            throw new InvalidQuantityError({ productId, quantity });
        }

        const cart = await cartRepository.findById(cartId);
        if (!cart) {
            throw new CartNotFoundError(cartId);
        }
        if (cart.status === 'CHECKED_OUT') {
            throw new CartAlreadyCheckedOutError(cartId);
        }

        const product = await productRepository.findById(productId);
        if (!product) {
            throw new ProductNotFoundError(productId);
        }

        if (quantity > product.stock) {
            throw new InsufficientStockError([{ productId, requested: quantity, available: product.stock }]);
        }

        const existingItem = cart.items.find((item) => item.productId === productId);
        await cartRepository.upsertItem(
            cartId,
            productId,
            quantity,
            existingItem ? existingItem.unitPriceCentsAtAdd : product.priceCents,
        );

        const freshCart = await cartRepository.findById(cartId);
        if (!freshCart) {
            throw new CartNotFoundError(cartId);
        }
        return buildCartView(freshCart);
    },

    async removeItem(cartId: string, productId: string) {
        const cart = await cartRepository.findById(cartId);
        if (!cart) {
            throw new CartNotFoundError(cartId);
        }
        if (cart.status === 'CHECKED_OUT') {
            throw new CartAlreadyCheckedOutError(cartId);
        }

        const deleted = await cartRepository.deleteItem(cartId, productId);
        if (deleted.count === 0) {
            throw new ItemNotInCartError(productId);
        }

        const freshCart = await cartRepository.findById(cartId);
        if (!freshCart) {
            throw new CartNotFoundError(cartId);
        }
        return buildCartView(freshCart);
    },

    async checkout(
        cartId: string,
        input: { couponCode?: string; expectedTotalCents?: number },
        paymentGateway: PaymentGateway = new FakePaymentGateway(),
    ) {
        const normalizedCoupon = input.couponCode ? input.couponCode.trim().toUpperCase() : undefined;
        if (normalizedCoupon && !/^[A-Z0-9-]{3,}$/.test(normalizedCoupon)) {
            throw new CouponInvalidFormatError(normalizedCoupon);
        }

        return prisma.$transaction(
            async (tx) => {
                const cart = await tx.cart.findUnique({
                    where: { id: cartId },
                    include: { items: { include: { product: true } } },
                });

                if (!cart) {
                    throw new CartNotFoundError(cartId);
                }

                const existingOrder = await tx.order.findUnique({
                    where: { cartId },
                    include: { items: true, coupon: true },
                });

                if (cart.status === 'CHECKED_OUT' || existingOrder) {
                    return buildOrderSnapshot(
                        existingOrder ?? { ...cart, items: [], subtotalCents: 0, discountCents: 0, totalCents: 0 },
                        true,
                    );
                }

                if (cart.items.length === 0) {
                    throw new EmptyCartError();
                }

                const cartClaim = await tx.cart.updateMany({
                    where: { id: cartId, status: 'OPEN' },
                    data: { status: 'CHECKED_OUT' },
                });

                if (cartClaim.count === 0) {
                    const replayOrder = await tx.order.findUnique({
                        where: { cartId },
                        include: { items: true, coupon: true },
                    });
                    if (!replayOrder) {
                        throw new CartAlreadyCheckedOutError(cartId);
                    }
                    return buildOrderSnapshot(replayOrder, true);
                }

                const sortedItems = [...cart.items].sort((a, b) => a.productId.localeCompare(b.productId));
                const priceLookup = new Map<string, number>();
                const stockFailures: Array<{ productId: string; requested: number; available: number }> = [];

                for (const item of sortedItems) {
                    const product = await tx.product.findUnique({ where: { id: item.productId } });
                    if (!product) {
                        throw new ProductNotFoundError(item.productId);
                    }
                    priceLookup.set(item.productId, product.priceCents);

                    const reservation = await tx.product.updateMany({
                        where: { id: item.productId, stock: { gte: item.quantity } },
                        data: { stock: { decrement: item.quantity } },
                    });

                    if (reservation.count === 0) {
                        stockFailures.push({
                            productId: item.productId,
                            requested: item.quantity,
                            available: product.stock,
                        });
                    }
                }

                if (stockFailures.length > 0) {
                    throw new InsufficientStockError(stockFailures);
                }

                let couponRecord: { id: string; code: string; discountPercent: number } | null = null;
                if (normalizedCoupon) {
                    const coupon = await tx.coupon.findUnique({ where: { code: normalizedCoupon } });
                    if (!coupon) {
                        throw new CouponNotFoundError(normalizedCoupon);
                    }
                    const redeemed = await tx.coupon.updateMany({
                        where: { code: normalizedCoupon, status: 'AVAILABLE' },
                        data: { status: 'REDEEMED', redeemedAt: new Date() },
                    });
                    if (redeemed.count === 0) {
                        throw new CouponAlreadyRedeemedError(normalizedCoupon);
                    }
                    couponRecord = { id: coupon.id, code: coupon.code, discountPercent: coupon.discountPercent };
                }

                const subtotalCents = sortedItems.reduce((sum, item) => {
                    const price = priceLookup.get(item.productId) ?? item.product.priceCents;
                    return sum + lineTotal(price, item.quantity);
                }, 0);

                const discountCents = couponRecord ? percentDiscount(subtotalCents, couponRecord.discountPercent) : 0;
                const totalCents = Math.max(0, subtotalCents - discountCents);

                if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== totalCents) {
                    const itemChanges = sortedItems
                        .map((item) => {
                            const currentPrice = priceLookup.get(item.productId) ?? item.product.priceCents;
                            const oldLineTotalCents = lineTotal(item.unitPriceCentsAtAdd, item.quantity);
                            const newLineTotalCents = lineTotal(currentPrice, item.quantity);
                            if (oldLineTotalCents === newLineTotalCents) {
                                return null;
                            }
                            return {
                                productId: item.productId,
                                oldUnitPriceCents: item.unitPriceCentsAtAdd,
                                newUnitPriceCents: currentPrice,
                                oldLineTotalCents,
                                newLineTotalCents,
                                deltaCents: newLineTotalCents - oldLineTotalCents,
                            };
                        })
                        .filter(Boolean) as Array<Record<string, unknown>>;

                    throw new PriceChangedError({
                        oldTotalCents: input.expectedTotalCents,
                        newTotalCents: totalCents,
                        itemChanges,
                    });
                }

                let paymentRef: string;
                try {
                    const charge = await paymentGateway.charge(`cart:${cartId}`, totalCents);
                    paymentRef = charge.paymentRef;
                } catch (_error) {
                    throw new PaymentFailedError({ cartId, amountCents: totalCents });
                }

                const order = await tx.order.create({
                    data: {
                        cartId,
                        status: 'PLACED',
                        subtotalCents: subtotalCents,
                        discountCents: discountCents,
                        totalCents: totalCents,
                        couponId: couponRecord?.id ?? null,
                        couponCode: couponRecord?.code ?? null,
                        couponPercent: couponRecord?.discountPercent ?? null,
                        paymentRef,
                    },
                    include: { items: true },
                });

                await tx.orderItem.createMany({
                    data: sortedItems.map((item) => {
                        const unitPriceCents = priceLookup.get(item.productId) ?? item.product.priceCents;
                        return {
                            orderId: order.id,
                            productId: item.productId,
                            productName: item.product.name,
                            unitPriceCents,
                            quantity: item.quantity,
                            lineTotalCents: lineTotal(unitPriceCents, item.quantity),
                        };
                    }),
                });

                const createdOrder = await tx.order.findUnique({
                    where: { id: order.id },
                    include: { items: true, coupon: true },
                });

                if (!createdOrder) {
                    throw new OrderNotFoundError(order.id);
                }

                return {
                    ...buildOrderSnapshot(createdOrder),
                    replayed: false,
                    price: {
                        subtotalCents,
                        discountCents,
                        totalCents,
                    },
                };
            },
            {
                timeout: 15000,
                maxWait: 15000,
                isolationLevel: 'Serializable',
            },
        );
    },
};
