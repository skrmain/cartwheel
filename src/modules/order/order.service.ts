import { OrderNotFoundError } from "../../shared/errors/app-error.js";
import { orderRepository } from "./order.repository.js";

export const orderService = {
  async getOrder(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    return {
      id: order.id,
      cartId: order.cartId,
      status: order.status,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      couponId: order.couponId,
      couponCode: order.couponCode,
      couponPercent: order.couponPercent,
      paymentRef: order.paymentRef,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents
      }))
    };
  }
};
