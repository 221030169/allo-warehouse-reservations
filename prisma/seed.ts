import { PrismaClient } from '@prisma/client';

// We create a direct connection instance here so we don't depend on external helper folders
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Cleaning up old data...');
  try {
    await prisma.idempotencyKey.deleteMany({});
    await prisma.reservation.deleteMany({});
    await prisma.inventoryStock.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.product.deleteMany({});
  } catch (e) {
    console.log('✨ No existing tables to clear. Proceeding to create fresh records...');
  }

  console.log('🌱 Starting database seeding...');

  // 1. Create Warehouses
  const whDelhi = await prisma.warehouse.create({
    data: { name: 'Delhi Hub', location: 'New Delhi, India' },
  });

  const whMumbai = await prisma.warehouse.create({
    data: { name: 'Mumbai Fulfillment Center', location: 'Mumbai, India' },
  });

  // 2. Create Products
  const phone = await prisma.product.create({
    data: { name: 'Allo Wireless Earbuds v2', sku: 'ALLO-EAR-002', price: 4999 },
  });

  const keyboard = await prisma.product.create({
    data: { name: 'Mechanical Clicky Keyboard', sku: 'ALLO-KEY-MECH', price: 8999 },
  });

  // 3. Setup Inventory Stocks per Warehouse
  await prisma.inventoryStock.create({
    data: {
      productId: phone.id,
      warehouseId: whDelhi.id,
      totalStock: 5,
      reservedStock: 0,
    },
  });

  await prisma.inventoryStock.create({
    data: {
      productId: phone.id,
      warehouseId: whMumbai.id,
      totalStock: 12,
      reservedStock: 0,
    },
  });

  await prisma.inventoryStock.create({
    data: {
      productId: keyboard.id,
      warehouseId: whDelhi.id,
      totalStock: 1, 
      reservedStock: 0,
    },
  });

  console.log('✅ Database successfully seeded with test warehouses and products!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });