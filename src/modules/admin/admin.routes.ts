import { Router } from "express";
import { generateCoupons, getReport, listCoupons, listOrders } from "./admin.controller.js";
import { generateCouponsSchema } from "./admin.schema.js";
import { validate } from "../../shared/middleware/validate.js";

export const adminRoutes = Router();

adminRoutes.post("/coupons/generate", validate(generateCouponsSchema), generateCoupons);
adminRoutes.get("/coupons", listCoupons);
adminRoutes.get("/orders", listOrders);
adminRoutes.get("/report", getReport);
