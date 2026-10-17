import { prisma, type PrismaClientOrTransaction } from "../../db/prisma.js";

export const adminRepository = {
  listCoupons(tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).coupon.findMany({ orderBy: { milestone: "asc" } });
  },
  listOrders(tx?: PrismaClientOrTransaction) {
    return (tx ?? prisma).order.findMany({
      orderBy: { createdAt: "desc" },
      include: { items: true }
    });
  }
};
