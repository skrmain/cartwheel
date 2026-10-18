import type { RequestHandler } from 'express';
import { routeParam } from '../../shared/utils/route-param.js';
import { productService } from './product.service.js';

export const listProducts: RequestHandler = async (_req, res, next) => {
    try {
        res.json(await productService.listProducts());
    } catch (error) {
        next(error);
    }
};

export const getProduct: RequestHandler = async (req, res, next) => {
    try {
        res.json(await productService.getProduct(routeParam(req.params, 'productId')));
    } catch (error) {
        next(error);
    }
};
