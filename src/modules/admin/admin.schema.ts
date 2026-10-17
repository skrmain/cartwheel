import { z } from "zod";

export const generateCouponsSchema = z.object({
  count: z.number().int().positive().optional()
});
