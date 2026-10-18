export class AppError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number,
        public readonly details: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = new.target.name;
    }

    static validation(message = 'Request validation failed.', details: Record<string, unknown> = {}) {
        return new AppError(message, 'VALIDATION_ERROR', 400, details);
    }
}

export class NotImplementedError extends AppError {
    constructor() {
        super('This endpoint is not implemented yet.', 'NOT_IMPLEMENTED', 501);
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Request validation failed.', details: Record<string, unknown> = {}) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}

export class InvalidQuantityError extends AppError {
    constructor(details: Record<string, unknown> = {}) {
        super('Quantity must be a positive integer between 1 and 100.', 'INVALID_QUANTITY', 422, details);
    }
}

export class ProductNotFoundError extends AppError {
    constructor(productId?: string) {
        super(
            productId ? `Product "${productId}" was not found.` : 'Product was not found.',
            'PRODUCT_NOT_FOUND',
            404,
            productId ? { productId } : {},
        );
    }
}

export class CartNotFoundError extends AppError {
    constructor(cartId?: string) {
        super(
            cartId ? `Cart "${cartId}" was not found.` : 'Cart was not found.',
            'CART_NOT_FOUND',
            404,
            cartId ? { cartId } : {},
        );
    }
}

export class OrderNotFoundError extends AppError {
    constructor(orderId?: string) {
        super(
            orderId ? `Order "${orderId}" was not found.` : 'Order was not found.',
            'ORDER_NOT_FOUND',
            404,
            orderId ? { orderId } : {},
        );
    }
}

export class ItemNotInCartError extends AppError {
    constructor(productId?: string) {
        super(
            productId ? `Product "${productId}" is not in the cart.` : 'Product is not in the cart.',
            'ITEM_NOT_IN_CART',
            404,
            productId ? { productId } : {},
        );
    }
}

export class CartAlreadyCheckedOutError extends AppError {
    constructor(cartId?: string) {
        super(
            cartId ? `Cart "${cartId}" has already been checked out.` : 'Cart has already been checked out.',
            'CART_ALREADY_CHECKED_OUT',
            409,
            cartId ? { cartId } : {},
        );
    }
}

export class EmptyCartError extends AppError {
    constructor() {
        super('Cart is empty.', 'EMPTY_CART', 422);
    }
}

export class InsufficientStockError extends AppError {
    constructor(items: Array<{ productId: string; requested: number; available: number }>) {
        super('Not enough stock is available for the requested items.', 'INSUFFICIENT_STOCK', 409, { items });
    }
}

export class PriceChangedError extends AppError {
    constructor(details: {
        oldTotalCents: number;
        newTotalCents: number;
        itemChanges: Array<Record<string, unknown>>;
    }) {
        super('The cart total changed while checking out.', 'PRICE_CHANGED', 409, details);
    }
}

export class CouponNotFoundError extends AppError {
    constructor(code?: string) {
        super(
            code ? `Coupon "${code}" was not found.` : 'Coupon was not found.',
            'COUPON_NOT_FOUND',
            404,
            code ? { code } : {},
        );
    }
}

export class CouponAlreadyRedeemedError extends AppError {
    constructor(code?: string) {
        super(
            code ? `Coupon "${code}" has already been redeemed.` : 'Coupon has already been redeemed.',
            'COUPON_ALREADY_REDEEMED',
            409,
            code ? { code } : {},
        );
    }
}

export class CouponInvalidFormatError extends AppError {
    constructor(code?: string) {
        super(
            code ? `Coupon code "${code}" is not in a valid format.` : 'Coupon code format is invalid.',
            'COUPON_INVALID_FORMAT',
            422,
            code ? { code } : {},
        );
    }
}

export class NoEligibleMilestoneError extends AppError {
    constructor(details: Record<string, unknown>) {
        super('No eligible coupon milestone is available.', 'NO_ELIGIBLE_MILESTONE', 409, details);
    }
}

export class PaymentFailedError extends AppError {
    constructor(details: Record<string, unknown> = {}) {
        super('Payment failed.', 'PAYMENT_FAILED', 402, details);
    }
}

export class ServiceBusyError extends AppError {
    constructor(retryAfterSeconds = 1) {
        super('The service is temporarily busy. Please retry.', 'SERVICE_BUSY', 503, { retryAfterSeconds });
    }
}
