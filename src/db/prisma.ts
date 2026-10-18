import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { config } from '../config/env.js';

const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });
export type PrismaTransactionClient = Prisma.TransactionClient;
export type PrismaClientOrTransaction = PrismaClient | PrismaTransactionClient;

let initialization: Promise<void> | undefined;

export function initializePrisma(): Promise<void> {
    initialization ??= (async () => {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
        await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000');
        await prisma.$queryRawUnsafe('PRAGMA foreign_keys=ON');
    })();

    return initialization;
}
