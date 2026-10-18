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

## Public endpoints

| Method   | Path                              | Request                                | Typical response                                 | Status                |
| -------- | --------------------------------- | -------------------------------------- | ------------------------------------------------ | --------------------- |
| `GET`    | `/health`                         | none                                   | `{ status: "ok" }`                               | 200                   |
| `GET`    | `/products`                       | none                                   | array of products                                | 200                   |
| `GET`    | `/products/:productId`            | none                                   | product record                                   | 200 / 404             |
| `POST`   | `/carts`                          | none                                   | `{ id, status, items, subtotalCents, warnings }` | 201                   |
| `GET`    | `/carts/:cartId`                  | none                                   | live cart view with item-level warnings          | 200 / 404             |
| `PUT`    | `/carts/:cartId/items/:productId` | `{ quantity }`                         | updated live cart view                           | 200 / 404 / 409 / 422 |
| `DELETE` | `/carts/:cartId/items/:productId` | none                                   | updated live cart view                           | 200 / 404 / 409       |
| `POST`   | `/carts/:cartId/checkout`         | `{ couponCode?, expectedTotalCents? }` | order snapshot                                   | 201 / 200 replay      |
| `GET`    | `/orders/:orderId`                | none                                   | order snapshot with items                        | 200 / 404             |

## Admin endpoints

All admin endpoints intentionally do not add authentication or authorization.

| Method | Path                      | Request | Typical response                           | Status    |
| ------ | ------------------------- | ------- | ------------------------------------------ | --------- |
| `POST` | `/admin/coupons/generate` | `{}`    | coupon record                              | 201 / 409 |
| `GET`  | `/admin/coupons`          | none    | list of coupons and redeemed order linkage | 200       |
| `GET`  | `/admin/orders`           | none    | list of orders with items                  | 200       |
| `GET`  | `/admin/report`           | none    | aggregate order/coupon summary             | 200       |

## Error shape

Errors use the standard response shape:

```json
{
    "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable summary",
        "details": {}
    }
}
```

## Example flow

```sh
# create a cart
curl -X POST http://localhost:3000/carts

# update a cart item
curl -X PUT http://localhost:3000/carts/:cartId/items/prod-keyboard \
  -H 'Content-Type: application/json' \
  -d '{"quantity":2}'

# view the cart
curl http://localhost:3000/carts/:cartId

# checkout
curl -X POST http://localhost:3000/carts/:cartId/checkout \
  -H 'Content-Type: application/json' \
  -d '{"expectedTotalCents":15998}'

# generate a coupon
curl -X POST http://localhost:3000/admin/coupons/generate \
  -H 'Content-Type: application/json' \
  -d '{}'

# checkout with a coupon
curl -X POST http://localhost:3000/carts/:cartId/checkout \
  -H 'Content-Type: application/json' \
  -d '{"couponCode":"SAVE-ABC123"}'

# get the admin report
curl http://localhost:3000/admin/report
```

## Notes

- Coupon codes are bearer codes and are not tied to a customer identity.
- Coupon generation is guarded by milestone uniqueness and DB-enforced rules.
- Product and checkout logic use integer-cent arithmetic so totals remain precise.
