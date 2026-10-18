# Decisions and trade-offs

## System invariants and where they are enforced

- Never sell more stock than available: enforced in checkout by conditional stock updates (`Product.stock` decremented only when `stock >= quantity`). The checkout transaction rolls back on any failed reservation.
- A cart can produce at most one order: enforced by `Order.cartId` being unique and by the replay guard in checkout.
- Retry-safe checkout: replay path returns the original order and ignores later coupon parameters; the transaction does not re-run payment or stock decrement when the cart is already checked out.
- A coupon is redeemed at most once and a failed checkout never consumes it: redemption is done with `updateMany` on the coupon record where `status = "AVAILABLE"`; failed transactions roll back.
- At most one coupon per milestone: enforced by `Coupon.milestone` unique; generation catches the unique-constraint race and reuses the already-created coupon.
- Money is always integer cents and totals never negative: all values are persisted as integers in cents, and the money helper clamps discount and total to non-negative values.

## Ambiguities and chosen semantics

- A completed order means an order with `status = "PLACED"`; failed and empty-cart attempts do not count toward coupon milestones.
- Coupon configuration is `COUPON_EVERY_N_ORDERS` (`n`, default `5`) and `COUPON_DISCOUNT_PERCENT` (`x`, default `10`).
- Milestones are cumulative: after `n` successful orders, admin generation may issue the next coupon; it issues at most one coupon per call and never skips an unissued milestone.
- Coupon codes are normalized by trimming surrounding whitespace and uppercasing before lookup. They are single-use bearer codes, are not customer-bound, and do not expire.
- A coupon applies once to the combined current-price subtotal, not once per item. Percentage discounts use half-up rounding in cents and are capped at the subtotal.
- Cart lines retain their add-time unit price for comparison, but the cart displays live product values and checkout uses the current price. `expectedTotalCents`, if supplied, compares against the computed checkout total after coupon discount.
- Adding an item does not reserve stock. A later stock decrease is surfaced as a cart warning and checkout revalidates inventory atomically.
- A checkout retry returns the persisted order values and price totals; `replayed` is the only response field that differs, and any coupon on a replay is ignored.
- There is no customer identity, authorization, coupon expiry, tax, shipping, cancellation, refund, or partial-fulfillment model in this exercise.

## Decision log

### Decision: Checkout idempotency and retries

**Context:** Checkout retries must not create duplicate orders or repeat payment and stock updates.

**Options considered:** An `Idempotency-Key` header; database-enforced replay using cart status and a unique order constraint; in-memory app flags.

**Choice:** Use database-enforced checkout replay. If `Cart.status = "CHECKED_OUT"` or an order already exists for the cart, return the original order with `replayed: true`.

**Why:** This is deterministic across process restarts and multiple app instances, and prevents duplicate work.

**Consequences:** Retries reuse the original order. A different coupon supplied on a later checkout attempt is ignored. The database-level unique constraint on `Order.cartId` also means failed orders cannot be persisted as separate records for the same cart; supporting that later would require revisiting the constraint so one cart can have multiple failed orders but at most one successful order.

### Decision: Stock changes under concurrent checkout

**Context:** Concurrent checkouts must not sell more stock than is available.

**Options considered:** Read-then-write checks in application code; conditional `updateMany` on stock compared with `gte: quantity`.

**Choice:** Use conditional `updateMany` with a stock decrement as the enforcement mechanism.

**Why:** The conditional update is safe under concurrency, and the transaction can roll back the change atomically.

**Consequences:** A failed reservation returns `INSUFFICIENT_STOCK` and leaves the cart and coupon unchanged.

### Decision: Cart quantity updates

**Context:** Customers need to change item quantities, and the API must behave predictably when a request is retried.

**Options considered:** Increment/decrement endpoints; an absolute `PUT` with `quantity`.

**Choice:** `PUT /carts/:cartId/items/:productId` with `quantity` as the final value in the cart.

**Why:**

- **Safe to retry.** Sending `quantity: 3` twice still leaves 3. An "add 1" retry could turn 3 into 4.
- **Easy to predict.** The client states the result it wants, not a change to an unknown starting point.
- **Keeps price tracking simple.** The unit-price snapshot from when the item was added is untouched, so price changes can still be detected at checkout.

**Consequences:** Clients must send the full desired quantity, not a delta. If two edits overlap, the last one wins, which is fine since a cart belongs to one customer.

### Decision: Price and inventory changes after adding to cart

**Context:** Product price or available inventory can change while an item is in an open cart. The cart must communicate those changes without promising a price or stock reservation that the system does not provide.

**Options considered:** Lock the add-time price and reserve inventory when adding an item; or keep the cart non-reserving, show current product values, and revalidate at checkout.

**Choice:** Adding an item does not lock its price or reserve stock. Cart views show the current price and available stock alongside the add-time price, flag price changes and insufficient availability, and checkout uses the current price while atomically reserving the requested stock. If `expectedTotalCents` is supplied, checkout rejects a different computed total with `PRICE_CHANGED`; otherwise it proceeds at the current total. If stock is no longer sufficient, checkout fails with `INSUFFICIENT_STOCK`.

**Why:** This avoids holding inventory for abandoned carts and keeps prices and availability current, while giving clients a way to detect changes and an optional safeguard against charging a total the customer did not expect.

**Consequences:** A cart is not a price quote or a stock reservation. Clients should refresh the cart before checkout and may submit `expectedTotalCents` to require confirmation after a price change. Failed checkout is atomic: it leaves the cart open and rolls back stock changes.

### Decision: Money representation and discount rounding

**Context:** Price and discount calculations must avoid floating-point drift and follow the required rounding rule.

**Options considered:** Float-based prices; integer cents with half-up rounding.

**Choice:** Store and calculate all money in integer cents, rounding percentage discounts with `Math.floor((subtotal * percent + 50) / 100)`.

**Why:** Integer cents avoid floating-point errors, and half-up rounding meets the specified rule.

**Consequences:** Discounts never exceed the order subtotal, and totals remain non-negative.

### Decision: Coupon generation race handling

**Context:** Concurrent admin requests must not generate multiple coupons for the same milestone.

**Options considered:** Allow both requests to create coupons; enforce a unique milestone and handle the constraint violation.

**Choice:** Make `Coupon.milestone` unique and, on `P2002`, reuse the already-created coupon when present.

**Why:** This preserves the one-coupon-per-milestone invariant while handling concurrent requests.

**Consequences:** Only one coupon is generated for each eligible milestone; a concurrent request can reuse it.

### Decision: Payment execution during checkout

**Context:** Payment execution must fit the checkout flow while keeping the exercise focused on transactional correctness.

**Options considered:** Charge inside the database transaction; charge outside it using an outbox or authorize-capture pattern.

**Choice:** For this exercise, charge inside the transactional flow.

**Why:** This keeps the implementation simple and focused on transactional correctness under retries.

**Consequences:** The payment call is coupled to database transaction behavior. For production, move payment outside the transaction to reduce transaction time and avoid coupling payment settlement to database commit semantics.

## Transaction and concurrency strategy

- Checkout starts in a single interactive Prisma transaction with a timeout and a max-wait guard.
- The cart is claimed with `updateMany({ where: { id, status: "OPEN" }, data: { status: "CHECKED_OUT" } })` before stock is decremented.
- An order is created only after successful stock reservation and payment.
- A replay is detected before any payment or stock mutation is re-run.
- Coupon redemption is conditional and atomic (`status = "AVAILABLE"` update), preventing double redemption race conditions.

## Money and rounding rules

- All prices are stored as integer cents.
- `percentDiscount(subtotalCents, percent)` applies the percentage once to the subtotal using half-up rounding.
- The discount is clamped so it can never exceed the subtotal, and totals are clamped to zero or greater.

## Error model

- Domain errors use `AppError` subclasses with stable codes and HTTP status codes.
- Validation errors are mapped from Zod issues with `VALIDATION_ERROR`.
- Prisma uniqueness collisions are treated as safe server errors, not leaked internals.
- SQLite lock and busy conditions are translated to `SERVICE_BUSY` with a retry-after hint.

## Implemented vs deferred

Implemented:

- cart creation and live cart view
- item upsert/removal with safe quantity checks
- checkout with replay, stock claim, and coupon redemption
- order lookup and admin coupon generation/reporting

Deferred:

- authentication and authorization
- coupon expiry logic
- explicit Idempotency-Key header semantics
- reservation on add-to-cart
- real payment integration with an outbox or authorize/capture flow
- pagination and large-report aggregation beyond the current scope

## Multi-instance and Postgres evolution

- The current design carries the same conditional-update semantics across multiple instances.
- In Postgres, the same pattern remains valid; for larger workloads one would add explicit row-locking where needed and an idempotency table keyed by `cartId` or `Idempotency-Key`.
- Payment would move outside the DB transaction to separate business consistency from external financial settlement.

## AI usage

Planning. I reviewed the requirements myself and identified the main risks: idempotent checkout, overselling under concurrency, and single-use coupons. I then used Claude to discuss and pressure-test the design before implementing it.

Implementation. I used GitHub Copilot to generate most of the code while keeping the design aligned to the plan and the required invariants.

Verification. I reviewed the implementation myself, refactored where needed, and fixed the issues I found. I validated the invariants with the existing test suites, including concurrent and repeated-request scenarios.

Example of a correction. The generated inventory and coupon logic used a check-then-update pattern: read the stock (or coupon status), check it in application code, then write. This isn’t atomic, so two concurrent checkouts could both pass the check and oversell inventory or redeem the same coupon. I changed it to a conditional update (for example, `UPDATE ... SET stock = stock - :qty WHERE stock >= :qty`, and likewise for marking a coupon redeemed only if it is still unused), then checked the affected row count to detect a lost race. I added a concurrency test to confirm only one request succeeds.

## What I'd examine with two more hours

- Coupon lifecycle. I’d revisit the coupon rules, starting with expiry dates, which are not enforced today. I’d also look at other ways to issue coupons beyond the order-milestone trigger, and make sure each one keeps the single-use and no-loss guarantees.
- Multi-instance behavior. The current design is validated against a single application instance. I’d test it with several instances sharing one database, and confirm that stock, coupon redemption, and idempotency are enforced by the database (conditional updates, unique constraints) rather than by in-process state.
- Scale and list endpoints. I’d test with larger datasets and add pagination and filtering to list endpoints, so admin reports and order listings stay fast and bounded.

## Time spent

Approximately 6-7 hours, slightly over the suggested 4-6 hour timebox. The extra time went mainly into writing this document.
