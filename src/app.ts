import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

import { adminRoutes } from './modules/admin/admin.routes.js';
import { cartRoutes } from './modules/cart/cart.routes.js';
import { orderRoutes } from './modules/order/order.routes.js';
import { productRoutes } from './modules/product/product.routes.js';

import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFound } from './shared/middleware/notFound.js';
import { requestLoggerMiddleware } from './shared/middleware/request-logger.js';

export const app = express();

const openapiYaml = readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8');
const openapiDocument = parse(openapiYaml);

app.use(requestLoggerMiddleware);
app.use(express.json({ limit: '100kb' }));

app.get('/docs', swaggerUi.setup(openapiDocument));
app.use('/docs', swaggerUi.serve);
app.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').send(openapiYaml);
});
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/products', productRoutes);
app.use('/carts', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);
