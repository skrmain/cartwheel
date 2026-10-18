import express from 'express';

import { adminRoutes } from './modules/admin/admin.routes.js';
import { cartRoutes } from './modules/cart/cart.routes.js';
import { orderRoutes } from './modules/order/order.routes.js';
import { productRoutes } from './modules/product/product.routes.js';

import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFound } from './shared/middleware/notFound.js';
import { requestLoggerMiddleware } from './shared/middleware/request-logger.js';

export const app = express();

app.use(requestLoggerMiddleware);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/products', productRoutes);
app.use('/carts', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);
