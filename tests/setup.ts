import { afterAll, beforeAll } from "vitest";
import { initializePrisma, prisma } from "../src/db/prisma.js";

beforeAll(async () => {
  await initializePrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});
