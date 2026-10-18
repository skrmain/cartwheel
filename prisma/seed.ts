import { initializePrisma, prisma } from '../src/db/prisma.js';

const products = [
    { id: 'prod-keyboard', name: 'Mechanical Keyboard', priceCents: 7999, stock: 50 },
    { id: 'prod-mouse', name: 'Wireless Mouse', priceCents: 2999, stock: 100 },
    { id: 'prod-usb-c-hub', name: 'USB-C Hub', priceCents: 4599, stock: 30 },
    { id: 'prod-monitor', name: '27" Monitor', priceCents: 21999, stock: 15 },
    { id: 'prod-laptop-stand', name: 'Laptop Stand', priceCents: 3499, stock: 40 },
    { id: 'prod-desk-mat', name: 'Limited Edition Desk Mat', priceCents: 5999, stock: 3 },
];

async function main(): Promise<void> {
    await initializePrisma();
    for (const product of products) {
        await prisma.product.upsert({
            where: { id: product.id },
            update: {
                name: product.name,
                priceCents: product.priceCents,
                stock: product.stock,
            },
            create: product,
        });
    }
    console.log(`Seeded ${products.length} products.`);
}

main()
    .catch((error: unknown) => {
        console.error('Product seeding failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
