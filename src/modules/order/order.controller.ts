import type { RequestHandler } from "express";
import { routeParam } from "../../shared/utils/route-param.js";
import { orderService } from "./order.service.js";

export const getOrder: RequestHandler = async (req, res, next) => {
  try {
    res.json(await orderService.getOrder(routeParam(req.params, "orderId")));
  } catch (error) {
    next(error);
  }
};
