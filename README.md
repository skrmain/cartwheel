# cartwheel - Checkout and Rewards API

This service offers product browsing, cart management, checkout, coupon redemption, and admin reporting for a small ecommerce flow. It intentionally keeps the business logic in a strict layered structure: routes -> controller -> service -> repository, with Prisma used only inside repository/service transaction code.

## Prerequisites

- Node.js 22.12 or newer
- npm

## Setup and run

```sh
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000` by default.

For a compiled run:

```sh
npm run build
npm start
```

`DATABASE_URL` is read from environment variables and defaults to the local SQLite database used by the project.

## Tests and type checking

```sh
npm test
npm run typecheck
```

Tests are organized under `tests/unit`, `tests/integration`, and `tests/concurrency`.
Each database-backed test file uses a fresh temporary SQLite database and resets its data between tests.

## API Reference

[`openapi.yaml`](./openapi.yaml) is the API contract and source of truth. It includes request and response schemas and examples, status-specific error responses, and the full error-code catalog. The interactive docs are served at `http://localhost:3000/docs/` (`/docs` redirects there); download the raw spec from `http://localhost:3000/openapi.yaml`.

No route requires authentication. Routes marked **ADMIN** are administrative operations and intentionally have no auth implemented by design; they are not protected.

| Method | Path | Access | Request body | Success status | Error statuses and codes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/health` | PUBLIC | — | `200` | `400 INVALID_JSON` |
| `GET` | `/products` | PUBLIC | — | `200` | `400 INVALID_JSON`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/products/{productId}` | PUBLIC | — | `200` | `400 INVALID_JSON`, `404 PRODUCT_NOT_FOUND`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `POST` | `/carts` | PUBLIC | none | `201` | `400 INVALID_JSON`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/carts/{cartId}` | PUBLIC | — | `200` | `400 INVALID_JSON`, `404 CART_NOT_FOUND`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `PUT` | `/carts/{cartId}/items/{productId}` | PUBLIC | `{ "quantity": 1 }` (integer 1-100) | `200` | `400 INVALID_JSON`, `VALIDATION_ERROR`; `404 CART_NOT_FOUND`, `PRODUCT_NOT_FOUND`; `409 CART_ALREADY_CHECKED_OUT`, `INSUFFICIENT_STOCK`; `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `DELETE` | `/carts/{cartId}/items/{productId}` | PUBLIC | none | `200` | `400 INVALID_JSON`; `404 CART_NOT_FOUND`, `ITEM_NOT_IN_CART`; `409 CART_ALREADY_CHECKED_OUT`; `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `POST` | `/carts/{cartId}/checkout` | PUBLIC | `{ "couponCode?": "SAVE-ABC123", "expectedTotalCents?": 7999 }` | `201` first checkout; `200` replay | `400 INVALID_JSON`, `VALIDATION_ERROR`; `402 PAYMENT_FAILED`; `404 CART_NOT_FOUND`, `COUPON_NOT_FOUND`; `409 INSUFFICIENT_STOCK`, `PRICE_CHANGED`, `COUPON_ALREADY_REDEEMED`; `422 EMPTY_CART`; `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/orders/{orderId}` | PUBLIC | — | `200` | `400 INVALID_JSON`, `404 ORDER_NOT_FOUND`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `POST` | `/admin/coupons/generate` | **ADMIN** | `{}` (optional `count` is accepted but one coupon is generated per call) | `201` | `400 INVALID_JSON`, `VALIDATION_ERROR`; `409 NO_ELIGIBLE_MILESTONE`; `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/admin/coupons` | **ADMIN** | — | `200` | `400 INVALID_JSON`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/admin/orders` | **ADMIN** | — | `200` | `400 INVALID_JSON`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/admin/report` | **ADMIN** | — | `200` | `400 INVALID_JSON`, `500 INTERNAL_SERVER_ERROR`, `503 SERVICE_BUSY` |
| `GET` | `/docs` | PUBLIC | — | `308` (redirects to `/docs/`) | `400 INVALID_JSON` |
| `GET` | `/openapi.yaml` | PUBLIC | — | `200` | `400 INVALID_JSON` |

Checkout returns the original order on a retry (`200`, `replayed: true`) even when that retry sends a different coupon code. `expectedTotalCents` is compared to the current computed total, after coupon discount; a mismatch returns `409 PRICE_CHANGED`. A failed checkout is atomic: stock, coupon state, and cart status are rolled back. Quantity and checkout-body shape violations are returned as `400 VALIDATION_ERROR`; invalid JSON is `400 INVALID_JSON`.

### Error codes

All error responses use `{ "error": { "code": "...", "message": "...", "details": {} } }`.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_JSON` | 400 | Request body is not valid JSON. |
| `VALIDATION_ERROR` | 400 | Request parameters or body failed schema validation. |
| `INVALID_QUANTITY` | 422 | Service-level quantity guard; HTTP requests outside 1-100 are rejected earlier as `VALIDATION_ERROR`. |
| `PRODUCT_NOT_FOUND` | 404 | Product does not exist. |
| `CART_NOT_FOUND` | 404 | Cart does not exist. |
| `ORDER_NOT_FOUND` | 404 | Order does not exist. |
| `ITEM_NOT_IN_CART` | 404 | Product is not in the cart. |
| `CART_ALREADY_CHECKED_OUT` | 409 | Cart is already checked out and cannot be changed. |
| `EMPTY_CART` | 422 | An empty cart cannot be checked out. |
| `INSUFFICIENT_STOCK` | 409 | Requested quantity exceeds available stock. |
| `PRICE_CHANGED` | 409 | Current checkout total differs from `expectedTotalCents`. |
| `COUPON_NOT_FOUND` | 404 | Coupon code does not exist. |
| `COUPON_ALREADY_REDEEMED` | 409 | Coupon has already been redeemed. |
| `COUPON_INVALID_FORMAT` | 422 | Service-level coupon format guard; malformed HTTP request values are rejected as `VALIDATION_ERROR`. |
| `NO_ELIGIBLE_MILESTONE` | 409 | No new coupon reward milestone is available. |
| `PAYMENT_FAILED` | 402 | Payment gateway rejected checkout. |
| `SERVICE_BUSY` | 503 | Database is locked or busy; retry after the supplied `Retry-After` interval. |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server failure. |
| `NOT_FOUND` | 404 | No registered route matches the request path. |

### Try it

The API is local and needs no user account, login, or shared workspace. Start it with the setup commands above, then use any of these:

1. **Swagger UI:** open [http://localhost:3000/docs/](http://localhost:3000/docs/) and try requests interactively.
2. **Curl demo:** run `bash scripts/demo.sh` against a freshly seeded database. It uses `BASE_URL` (default `http://localhost:3000`) and `COUPON_EVERY_N_ORDERS` (default `5`); it uses `jq` for formatted output when installed.
3. **Postman:** in Postman, choose **File > Import** and import [`postman/checkout-rewards-api.postman_collection.json`](./postman/checkout-rewards-api.postman_collection.json) and [`postman/local.postman_environment.json`](./postman/local.postman_environment.json), then select the local environment and run the collection in order. Collection scripts capture cart, order, and coupon IDs for later requests. Alternatively, import [`openapi.yaml`](./openapi.yaml) directly.

## Notes

- Coupon codes are bearer codes and are not tied to a customer identity.
- Coupon generation is guarded by milestone uniqueness and DB-enforced rules.
- Product and checkout logic use integer-cent arithmetic so totals remain precise.
