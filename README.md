# Cartwheel Checkout and Rewards API

A TypeScript/Express API scaffold for an ecommerce checkout and rewards service. Product listing and product seeding are implemented; other business endpoints intentionally return `501 NOT_IMPLEMENTED`. No authentication is implemented.

## Prerequisites

- Node.js 22.12 or newer (Node.js 24 LTS recommended)
- npm

## Setup and run

```sh
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000` by default. To build and run the compiled server:

```sh
npm run build
npm start
```

`DATABASE_URL` defaults to `file:./dev.db`. Coupon configuration is validated at process startup: `COUPON_EVERY_N_ORDERS` must be a positive integer and `COUPON_DISCOUNT_PERCENT` must be an integer from 1 through 100.

## Database commands

- `npm run prisma:generate` generates the Prisma Client.
- `npm run prisma:migrate` applies/creates development migrations.
- `npm run db:seed` idempotently upserts the six starter products.
- `npm run db:reset` drops and recreates the database, applies migrations, and runs the seed command. This is destructive to the configured database.

## Tests and type checking

```sh
npm test
npm run test:watch
npm run typecheck
```

The smoke test expects the database schema to have been migrated. It checks both health and product listing routes; it does not require seed data.

## Endpoints

### PUBLIC

| Method | Endpoint | Status |
| --- | --- | --- |
| `GET` | `/health` | Implemented |
| `GET` | `/products` | Implemented |
| `POST` | `/carts` | `501 NOT_IMPLEMENTED` |
| `GET` | `/carts/:cartId` | `501 NOT_IMPLEMENTED` |
| `PUT` | `/carts/:cartId/items/:productId` | `501 NOT_IMPLEMENTED` |
| `DELETE` | `/carts/:cartId/items/:productId` | `501 NOT_IMPLEMENTED` |
| `POST` | `/carts/:cartId/checkout` | `501 NOT_IMPLEMENTED` |
| `GET` | `/orders/:orderId` | `501 NOT_IMPLEMENTED` |

### ADMIN

All endpoints under `/admin` are ADMIN endpoints. Authentication and authorization are intentionally not implemented.

| Method | Endpoint | Status |
| --- | --- | --- |
| `POST` | `/admin/coupons/generate` | `501 NOT_IMPLEMENTED` |
| `GET` | `/admin/coupons` | `501 NOT_IMPLEMENTED` |
| `GET` | `/admin/orders` | `501 NOT_IMPLEMENTED` |
| `GET` | `/admin/report` | `501 NOT_IMPLEMENTED` |

Errors use the shape `{ "error": { "code": "SOME_CODE", "message": "...", "details": {} } }`.
