import { prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const cartRepository = {
  findById(id: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).cart.findUnique({
      where: { id },
      include: { items: { include: { product: true } } }
    });
  },

  create(tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).cart.create({
      data: { status: "OPEN" },
      include: { items: { include: { product: true } } }
    });
  },

  async upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    unitPriceCentsAtAdd: number,
    tx?: PrismaClientOrTransaction
  ) {
    const client = tx ?? prisma;
    return client.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: {
        cartId,
        productId,
        quantity,
        unitPriceCentsAtAdd
      },
      update: {
        quantity
      }
    });
  },

  deleteItem(cartId: string, productId: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).cartItem.deleteMany({ where: { cartId, productId } });
  },

  claimOpenCart(cartId: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).cart.updateMany({
      where: { id: cartId, status: "OPEN" },
      data: { status: "CHECKED_OUT" }
    });
  }
};
