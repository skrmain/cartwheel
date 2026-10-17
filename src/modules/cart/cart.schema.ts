import { z } from "zod";

export const cartIdSchema = z.object({ cartId: z.string().min(1) });
export const cartItemParamsSchema = z.object({
  cartId: z.string().min(1),
  productId: z.string().min(1)
});
export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive()
});
