import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Cleaning up existing data...');
  // Delete all existing data to start fresh
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  await prisma.idempotency.deleteMany();

  console.log('Seeding products...');
  const shoes = await prisma.product.create({
    data: {
      name: 'AeroGlide Carbon Running Shoes',
      sku: 'SHO-AG-001',
      description: 'Ultra-lightweight marathon running shoes with a carbon-fiber plate for maximum energy return.',
      price: 159.99,
    },
  });

  const keyboard = await prisma.product.create({
    data: {
      name: 'Nebula RGB Mechanical Keyboard',
      sku: 'KEY-NB-002',
      description: 'Hot-swappable mechanical keyboard with custom linear switches and customizable RGB lighting.',
      price: 189.50,
    },
  });

  const mouse = await prisma.product.create({
    data: {
      name: 'Apex Pro Wireless Gaming Mouse',
      sku: 'MOU-AP-003',
      description: 'Wireless gaming mouse with 26K DPI optical sensor and sub-millisecond response latency.',
      price: 89.99,
    },
  });

  const headphones = await prisma.product.create({
    data: {
      name: 'Quantum Noise-Canceling Headphones',
      sku: 'AUD-QN-004',
      description: 'Premium wireless over-ear headphones with hybrid active noise cancellation and 40h battery life.',
      price: 299.00,
    },
  });

  console.log('Seeding warehouses...');
  const NY = await prisma.warehouse.create({
    data: {
      name: 'East Coast Fulfillment Center (New York)',
      location: 'New York, NY',
    },
  });

  const Chicago = await prisma.warehouse.create({
    data: {
      name: 'Midwest Distribution Hub (Chicago)',
      location: 'Chicago, IL',
    },
  });

  const LA = await prisma.warehouse.create({
    data: {
      name: 'West Coast Logistics (Los Angeles)',
      location: 'Los Angeles, CA',
    },
  });

  console.log('Seeding stock levels...');
  // Shoes stock
  await prisma.stock.createMany({
    data: [
      { productId: shoes.id, warehouseId: NY.id, quantity: 12, reserved: 0 },
      { productId: shoes.id, warehouseId: Chicago.id, quantity: 5, reserved: 0 },
      { productId: shoes.id, warehouseId: LA.id, quantity: 0, reserved: 0 },
    ],
  });

  // Keyboard stock
  await prisma.stock.createMany({
    data: [
      { productId: keyboard.id, warehouseId: NY.id, quantity: 3, reserved: 0 },
      { productId: keyboard.id, warehouseId: Chicago.id, quantity: 8, reserved: 0 },
      { productId: keyboard.id, warehouseId: LA.id, quantity: 15, reserved: 0 },
    ],
  });

  // Mouse stock
  await prisma.stock.createMany({
    data: [
      { productId: mouse.id, warehouseId: NY.id, quantity: 20, reserved: 0 },
      { productId: mouse.id, warehouseId: Chicago.id, quantity: 25, reserved: 0 },
      { productId: mouse.id, warehouseId: LA.id, quantity: 20, reserved: 0 },
    ],
  });

  // Headphones stock (NY has exactly 1 unit left for race condition testing!)
  await prisma.stock.createMany({
    data: [
      { productId: headphones.id, warehouseId: NY.id, quantity: 1, reserved: 0 },
      { productId: headphones.id, warehouseId: Chicago.id, quantity: 0, reserved: 0 },
      { productId: headphones.id, warehouseId: LA.id, quantity: 4, reserved: 0 },
    ],
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
