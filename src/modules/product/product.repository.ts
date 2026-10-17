import { initializePrisma, prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const productRepository = {
  async list(tx?: PrismaClientOrTransaction) {
    await initializePrisma();
    return (tx ?? prisma).product.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }
};
