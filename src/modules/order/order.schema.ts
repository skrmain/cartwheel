import { z } from "zod";

export const orderIdSchema = z.object({ orderId: z.string().min(1) });
export const checkoutSchema = z.object({
  couponCode: z.string().min(1).optional(),
  expectedTotalCents: z.number().int().nonnegative().optional()
});
