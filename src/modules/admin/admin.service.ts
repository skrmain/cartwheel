import { NotImplementedError } from "../../shared/errors/app-error.js";

export const adminService = {
  async generateCoupons(_input: { count?: number }): Promise<never> {
    throw new NotImplementedError();
  },
  async listCoupons(): Promise<never> {
    throw new NotImplementedError();
  },
  async listOrders(): Promise<never> {
    throw new NotImplementedError();
  },
  async getReport(): Promise<never> {
    throw new NotImplementedError();
  }
};
