import type { RequestHandler } from "express";
import { adminService } from "./admin.service.js";

export const generateCoupons: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await adminService.generateCoupons(req.body));
  } catch (error) {
    next(error);
  }
};

export const listCoupons: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await adminService.listCoupons());
  } catch (error) {
    next(error);
  }
};

export const listOrders: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await adminService.listOrders());
  } catch (error) {
    next(error);
  }
};

export const getReport: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await adminService.getReport());
  } catch (error) {
    next(error);
  }
};
