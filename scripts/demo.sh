#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
MILESTONE_N="${COUPON_EVERY_N_ORDERS:-5}"

if ! [[ "$MILESTONE_N" =~ ^[1-9][0-9]*$ ]]; then
    printf 'COUPON_EVERY_N_ORDERS must be a positive integer.\n' >&2
    exit 1
fi

show_step() {
    printf '\n== %s ==\n' "$1"
}

call_api() {
    local method="$1"
    local path="$2"
    local data="${3-}"
    local output
    if [[ -n "$data" ]]; then
        output="$(curl -sS -X "$method" "$BASE_URL$path" -H 'Content-Type: application/json' -d "$data" -w $'\n%{http_code}')"
    else
        output="$(curl -sS -X "$method" "$BASE_URL$path" -w $'\n%{http_code}')"
    fi
    API_BODY="${output%$'\n'*}"
    API_STATUS="${output##*$'\n'}"
}

show_response() {
    if command -v jq >/dev/null 2>&1; then
        printf '%s\n' "$API_BODY" | jq .
    else
        printf '%s\n' "$API_BODY"
    fi
}

json_value() {
    if command -v jq >/dev/null 2>&1; then
        printf '%s\n' "$API_BODY" | jq -r "$1"
    else
        JSON_PATH="$1" node -e '
            const path = process.env.JSON_PATH.split(".");
            let value = JSON.parse(require("fs").readFileSync(0, "utf8"));
            for (const key of path) value = value?.[key];
            process.stdout.write(value == null ? String(value) : String(value));
        ' <<<"$API_BODY"
    fi
}

expect_status() {
    local expected="$1"
    if [[ "$API_STATUS" != "$expected" ]]; then
        printf 'Expected HTTP %s, got %s:\n' "$expected" "$API_STATUS" >&2
        show_response >&2
        exit 1
    fi
}

show_step '1. List seeded products'
call_api GET /products
expect_status 200
show_response

show_step '2. Create a cart'
call_api POST /carts '{}'
expect_status 201
show_response
CART_ID="$(json_value id)"

show_step '3. Add a keyboard to the cart'
call_api PUT "/carts/$CART_ID/items/prod-keyboard" '{"quantity":1}'
expect_status 200
show_response

show_step '4. View the cart'
call_api GET "/carts/$CART_ID"
expect_status 200
show_response

show_step '5. Check out the cart for the first time'
call_api POST "/carts/$CART_ID/checkout" '{"expectedTotalCents":7999}'
expect_status 201
show_response
ORDER_ID="$(json_value id)"

show_step '6. Replay checkout with a different coupon code'
call_api POST "/carts/$CART_ID/checkout" '{"couponCode":"SAVE-REPLAY-IGNORED"}'
expect_status 200
show_response
REPLAY_ORDER_ID="$(json_value id)"
REPLAYED="$(json_value replayed)"
if [[ "$REPLAY_ORDER_ID" != "$ORDER_ID" || "$REPLAYED" != 'true' ]]; then
    printf 'Checkout replay did not return the same order with replayed:true.\n' >&2
    exit 1
fi
printf 'Verified original orderId=%s, replay orderId=%s, replayed=%s\n' \
    "$ORDER_ID" "$REPLAY_ORDER_ID" "$REPLAYED"

show_step "7. Place orders until milestone $MILESTONE_N is reached"
for ((i = 1; i < MILESTONE_N; i++)); do
    printf 'Placing milestone order %s of %s...\n' "$((i + 1))" "$MILESTONE_N"
    call_api POST /carts '{}'
    expect_status 201
    milestone_cart="$(json_value id)"
    call_api PUT "/carts/$milestone_cart/items/prod-mouse" '{"quantity":1}'
    expect_status 200
    call_api POST "/carts/$milestone_cart/checkout" '{}'
    expect_status 201
done

show_step '8. Generate the milestone coupon (admin)'
call_api POST /admin/coupons/generate '{}'
expect_status 201
show_response
COUPON_CODE="$(json_value code)"

show_step '9. Check out a cart with the coupon'
call_api POST /carts '{}'
expect_status 201
COUPON_CART_ID="$(json_value id)"
call_api PUT "/carts/$COUPON_CART_ID/items/prod-keyboard" '{"quantity":1}'
expect_status 200
call_api POST "/carts/$COUPON_CART_ID/checkout" "{\"couponCode\":\"$COUPON_CODE\"}"
expect_status 201
show_response

show_step '10. Try to reuse the redeemed coupon'
call_api POST /carts '{}'
expect_status 201
REUSE_CART_ID="$(json_value id)"
call_api PUT "/carts/$REUSE_CART_ID/items/prod-keyboard" '{"quantity":1}'
expect_status 200
call_api POST "/carts/$REUSE_CART_ID/checkout" "{\"couponCode\":\"$COUPON_CODE\"}"
expect_status 409
show_response
if [[ "$(json_value error.code)" != 'COUPON_ALREADY_REDEEMED' ]]; then
    printf 'Expected COUPON_ALREADY_REDEEMED when reusing the coupon.\n' >&2
    exit 1
fi

show_step '11. Demonstrate limited-stock overselling is rejected atomically'
call_api POST /carts '{}'
expect_status 201
FIRST_STOCK_CART="$(json_value id)"
call_api POST /carts '{}'
expect_status 201
SECOND_STOCK_CART="$(json_value id)"
call_api PUT "/carts/$FIRST_STOCK_CART/items/prod-desk-mat" '{"quantity":2}'
expect_status 200
call_api PUT "/carts/$SECOND_STOCK_CART/items/prod-desk-mat" '{"quantity":2}'
expect_status 200
call_api POST "/carts/$FIRST_STOCK_CART/checkout" '{}'
expect_status 201
call_api POST "/carts/$SECOND_STOCK_CART/checkout" '{}'
expect_status 409
show_response
if [[ "$(json_value error.code)" != 'INSUFFICIENT_STOCK' ]]; then
    printf 'Expected INSUFFICIENT_STOCK for the second limited-stock checkout.\n' >&2
    exit 1
fi

show_step '12. Read the administrative report'
call_api GET /admin/report
expect_status 200
show_response
