import type { RequestHandler } from "express";
import { routeParam } from "../../shared/utils/route-param.js";
import { cartService } from "./cart.service.js";

export const createCart: RequestHandler = async (_req, res, next) => {
  try {
    res.status(201).json(await cartService.createCart());
  } catch (error) {
    next(error);
  }
};

export const getCart: RequestHandler = async (req, res, next) => {
  try {
    res.json(await cartService.getCart(routeParam(req.params, "cartId")));
  } catch (error) {
    next(error);
  }
};

export const updateCartItem: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await cartService.updateItem(
        routeParam(req.params, "cartId"),
        routeParam(req.params, "productId"),
        req.body.quantity
      )
    );
  } catch (error) {
    next(error);
  }
};

export const removeCartItem: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await cartService.removeItem(
        routeParam(req.params, "cartId"),
        routeParam(req.params, "productId")
      )
    );
  } catch (error) {
    next(error);
  }
};

export const checkout: RequestHandler = async (req, res, next) => {
  try {
    res.json(await cartService.checkout(routeParam(req.params, "cartId"), req.body));
  } catch (error) {
    next(error);
  }
};
