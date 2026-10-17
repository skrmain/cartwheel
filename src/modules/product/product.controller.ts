import type { RequestHandler } from "express";
import { productService } from "./product.service.js";

export const listProducts: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await productService.listProducts());
  } catch (error) {
    next(error);
  }
};
