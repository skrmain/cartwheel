import { Router } from 'express';
import { checkout, createCart, getCart, removeCartItem, updateCartItem } from './cart.controller.js';
import { validate } from '../../shared/middleware/validate.js';
import { cartIdSchema, cartItemParamsSchema, updateCartItemSchema } from './cart.schema.js';
import { checkoutSchema } from '../order/order.schema.js';

export const cartRoutes = Router();

cartRoutes.post('/', createCart);
cartRoutes.get('/:cartId', validate(cartIdSchema, 'params'), getCart);
cartRoutes.put(
    '/:cartId/items/:productId',
    validate(cartItemParamsSchema, 'params'),
    validate(updateCartItemSchema),
    updateCartItem,
);
cartRoutes.delete('/:cartId/items/:productId', validate(cartItemParamsSchema, 'params'), removeCartItem);
cartRoutes.post('/:cartId/checkout', validate(cartIdSchema, 'params'), validate(checkoutSchema), checkout);
