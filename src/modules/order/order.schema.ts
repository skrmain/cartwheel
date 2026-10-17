import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const couponCodeSchema = z
  .string()
  .trim()
  .transform((val) => val.toUpperCase())
  .refine((value) => /^[A-Z0-9-]+$/.test(value) && value.length >= 3, {
    message: "Coupon code must be uppercase and use only letters, numbers, and dashes."
  });

export const orderIdSchema = z.object({ orderId: nonEmptyString });
export const checkoutSchema = z.object({
  couponCode: couponCodeSchema.optional(),
  expectedTotalCents: z.number().int().nonnegative().optional()
});
