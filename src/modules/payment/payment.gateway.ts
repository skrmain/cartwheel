export interface PaymentGateway {
    charge(orderRef: string, amountCents: number): Promise<{ paymentRef: string }>;
    charge(input: { amountCents: number; idempotencyKey: string }): Promise<{ paymentRef: string }>;
}

export class FakePaymentGateway implements PaymentGateway {
    async charge(
        arg: string | { amountCents: number; idempotencyKey: string },
        maybeAmountCents?: number,
    ): Promise<{ paymentRef: string }> {
        const input = typeof arg === 'string' ? { amountCents: maybeAmountCents ?? 0, idempotencyKey: arg } : arg;

        return { paymentRef: `fake-${input.idempotencyKey}` };
    }
}

// In production, the charge should happen outside the database transaction using an
// authorize/capture or outbox pattern so payment settlement is not tied to the DB commit.
