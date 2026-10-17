import { z } from "zod";

export const productIdSchema = z.object({
  productId: z.string().min(1)
});
