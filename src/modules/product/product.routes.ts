import { Router } from "express";
import { listProducts } from "./product.controller.js";

export const productRoutes = Router();

productRoutes.get("/", listProducts);
