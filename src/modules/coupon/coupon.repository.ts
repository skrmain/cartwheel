import { prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const couponRepository = {
  findByCode(code: string, tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).coupon.findUnique({ where: { code } });
  }
};
