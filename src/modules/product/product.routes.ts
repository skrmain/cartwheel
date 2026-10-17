import { Router } from "express";
import { validate } from "../../shared/middleware/validate.js";
import { getProduct, listProducts } from "./product.controller.js";
import { productIdSchema } from "./product.schema.js";

export const productRoutes = Router();

productRoutes.get("/", listProducts);
productRoutes.get("/:productId", validate(productIdSchema, "params"), getProduct);
