import { prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const cartRepository = {
  findById(id: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).cart.findUnique({
      where: { id },
      include: { items: { include: { product: true } } }
    });
  }
};
