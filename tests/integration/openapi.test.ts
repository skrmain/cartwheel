import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { app } from '../../src/app.js';
import { adminRoutes } from '../../src/modules/admin/admin.routes.js';
import { cartRoutes } from '../../src/modules/cart/cart.routes.js';
import { orderRoutes } from '../../src/modules/order/order.routes.js';
import { productRoutes } from '../../src/modules/product/product.routes.js';

const specPath = fileURLToPath(new URL('../../openapi.yaml', import.meta.url));
const spec = parse(readFileSync(specPath, 'utf8')) as { paths: Record<string, Record<string, unknown>> };
const mountedRouters = new Map([
    [productRoutes, '/products'],
    [cartRoutes, '/carts'],
    [orderRoutes, '/orders'],
    [adminRoutes, '/admin'],
]);

function normalizedPath(path: string): string {
    return path.replace(/:([^/]+)/g, '{$1}').replace(/\/$/, '') || '/';
}

function registeredRoutes(): Set<string> {
    const routes = new Set<string>();
    for (const layer of app.router.stack) {
        if (layer.route) {
            for (const method of Object.keys(layer.route.methods)) {
                routes.add(`${method.toUpperCase()} ${normalizedPath(layer.route.path)}`);
            }
            continue;
        }

        const prefix = mountedRouters.get(layer.handle);
        if (!prefix) continue;
        for (const child of layer.handle.stack) {
            if (!child.route) continue;
            for (const method of Object.keys(child.route.methods)) {
                routes.add(`${method.toUpperCase()} ${normalizedPath(`${prefix}${child.route.path}`)}`);
            }
        }
    }
    return routes;
}

it('keeps documented paths and HTTP methods in sync with Express registrations', () => {
    const actual = registeredRoutes();
    const documented = new Set<string>();
    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const method of Object.keys(pathItem)) {
            documented.add(`${method.toUpperCase()} ${path}`);
        }
    }

    expect([...documented].sort()).toEqual([...actual].sort());
});

it('serves the Swagger UI, its assets, and the raw OpenAPI source', async () => {
    const redirect = await request(app).get('/docs');
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe('/docs/');

    const ui = await request(app).get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui-bundle.js');

    const css = await request(app).get('/docs/swagger-ui.css');
    expect(css.status).toBe(200);

    const bundle = await request(app).get('/docs/swagger-ui-bundle.js');
    expect(bundle.status).toBe(200);

    const init = await request(app).get('/docs/swagger-ui-init.js');
    expect(init.status).toBe(200);

    const rawSpec = await request(app).get('/openapi.yaml');
    expect(rawSpec.status).toBe(200);
    expect(rawSpec.text).toContain('openapi: 3.0.3');
});
