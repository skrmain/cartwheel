import { NotImplementedError } from "../../shared/errors/app-error.js";

export const cartService = {
  async createCart(): Promise<never> {
    throw new NotImplementedError();
  },
  async getCart(_cartId: string): Promise<never> {
    throw new NotImplementedError();
  },
  async updateItem(_cartId: string, _productId: string, _quantity: number): Promise<never> {
    throw new NotImplementedError();
  },
  async removeItem(_cartId: string, _productId: string): Promise<never> {
    throw new NotImplementedError();
  },
  async checkout(
    _cartId: string,
    _input: { couponCode?: string; expectedTotalCents?: number }
  ): Promise<never> {
    throw new NotImplementedError();
  }
};
