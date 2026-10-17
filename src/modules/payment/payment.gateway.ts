export interface PaymentGateway {
  charge(input: { amountCents: number; idempotencyKey: string }): Promise<{ paymentRef: string }>;
}

export class FakePaymentGateway implements PaymentGateway {
  async charge(input: {
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ paymentRef: string }> {
    return { paymentRef: `fake-${input.idempotencyKey}` };
  }
}
