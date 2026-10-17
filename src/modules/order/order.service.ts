import { NotImplementedError } from "../../shared/errors/app-error.js";

export const orderService = {
  async getOrder(_orderId: string): Promise<never> {
    throw new NotImplementedError();
  }
};
