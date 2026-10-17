import { prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const orderRepository = {
  findById(id: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).order.findUnique({
      where: { id },
      include: { items: true }
    });
  }
};
