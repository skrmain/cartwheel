import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

export const cartIdSchema = z.object({ cartId: nonEmptyString });
export const cartItemParamsSchema = z.object({
    cartId: nonEmptyString,
    productId: nonEmptyString,
});
export const updateCartItemSchema = z.object({
    quantity: z.number().int().min(1).max(100),
});
