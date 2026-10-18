import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'must not be empty'),
    COUPON_EVERY_N_ORDERS: z.coerce.number().int().positive().default(5),
    COUPON_DISCOUNT_PERCENT: z.coerce.number().int().min(1).max(100).default(10),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
}

export const config = {
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    couponEveryNOrders: result.data.COUPON_EVERY_N_ORDERS,
    couponDiscountPercent: result.data.COUPON_DISCOUNT_PERCENT,
} as const;
