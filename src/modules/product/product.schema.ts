import { z } from "zod";

export const productIdSchema = z.object({
  productId: z.string().trim().min(1)
});
