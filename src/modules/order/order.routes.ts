import { Router } from "express";
import { getOrder } from "./order.controller.js";
import { orderIdSchema } from "./order.schema.js";
import { validate } from "../../shared/middleware/validate.js";

export const orderRoutes = Router();

orderRoutes.get("/:orderId", validate(orderIdSchema, "params"), getOrder);
