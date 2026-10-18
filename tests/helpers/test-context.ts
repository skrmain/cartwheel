import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

export async function createTestContext() {
    const directory = mkdtempSync(join(tmpdir(), 'cartwheel-test-'));
    const databasePath = join(directory, 'test.db');
    process.env.DATABASE_URL = `file:${databasePath}`;

    const migrationPath = fileURLToPath(
        new URL('../../prisma/migrations/20261017190727_init/migration.sql', import.meta.url),
    );
    const database = new Database(databasePath);
    database.exec(readFileSync(migrationPath, 'utf8'));
    database.close();

    const [{ app }, db] = await Promise.all([
        import('../../src/app.js'),
        import('../../src/db/prisma.js'),
    ]);
    await db.initializePrisma();
    const requestLogger = vi.spyOn(console, 'log').mockImplementation(() => {});

    return {
        app,
        prisma: db.prisma,
        async reset() {
            await db.prisma.orderItem.deleteMany();
            await db.prisma.order.deleteMany();
            await db.prisma.cartItem.deleteMany();
            await db.prisma.coupon.deleteMany();
            await db.prisma.cart.deleteMany();
            await db.prisma.product.deleteMany();
        },
        async close() {
            await db.prisma.$disconnect();
            requestLogger.mockRestore();
            rmSync(directory, { recursive: true, force: true });
        },
    };
}
