import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function runConcurrencyTest() {
  console.log('=== STARTING CONCURRENCY SAFETY TEST ===');
  
  // 1. Fetch the seed data
  const product = await prisma.product.findUnique({
    where: { sku: 'AUD-QN-004' } // Quantum Headphones
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { name: { startsWith: 'East Coast' } } // New York
  });

  if (!product || !warehouse) {
    console.error('Error: Seed data not found. Please run seed script first.');
    process.exit(1);
  }

  console.log(`Target Product: ${product.name} (SKU: ${product.sku})`);
  console.log(`Target Warehouse: ${warehouse.name}`);
  
  // 2. Reset stock level to exactly 1 total unit, 0 reserved
  console.log('\nResetting stock to 1 unit available (quantity: 1, reserved: 0)...');
  await prisma.stock.update({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id
      }
    },
    data: {
      quantity: 1,
      reserved: 0
    }
  });

  // Clear existing reservations for this product/warehouse to start clean
  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id
    }
  });

  console.log('Stock reset complete. Simulating 10 concurrent reservation requests...');

  // 3. Fire 10 concurrent database transactions in parallel
  const numRequests = 10;
  const reservationPromises = Array.from({ length: numRequests }).map(async (_, index) => {
    const requestId = index + 1;
    try {
      // Replicate the exact atomic transaction logic from our API
      const reservation = await prisma.$transaction(async (tx) => {
        const updatedRows = await tx.$executeRaw`
          UPDATE "Stock"
          SET "reserved" = "reserved" + 1
          WHERE "productId" = ${product.id}
            AND "warehouseId" = ${warehouse.id}
            AND "quantity" - "reserved" >= 1
        `;

        if (updatedRows === 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        return await tx.reservation.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 1,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
          }
        });
      });
      
      return { requestId, success: true, data: reservation };
    } catch (error: any) {
      return { requestId, success: false, error: error.message };
    }
  });

  const results = await Promise.all(reservationPromises);

  // 4. Analyze results
  const successfulRequests = results.filter(r => r.success);
  const failedRequests = results.filter(r => !r.success);

  console.log('\n=== TEST RESULTS ===');
  results.forEach(res => {
    if (res.success) {
      console.log(`Request #${res.requestId}: SUCCESS (Reservation ID: ${res.data?.id})`);
    } else {
      console.log(`Request #${res.requestId}: FAILED - ${res.error}`);
    }
  });

  console.log('\n=== SUMMARY ===');
  console.log(`Total Requests: ${numRequests}`);
  console.log(`Successes     : ${successfulRequests.length} (Expected: 1)`);
  console.log(`Failures      : ${failedRequests.length} (Expected: 9)`);

  // Verify stock levels in DB
  const finalStock = await prisma.stock.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id
      }
    }
  });

  console.log('\n=== FINAL DB STATE ===');
  console.log(`Physical Quantity: ${finalStock?.quantity}`);
  console.log(`Reserved Quantity: ${finalStock?.reserved}`);
  console.log(`Available Stock  : ${(finalStock?.quantity ?? 0) - (finalStock?.reserved ?? 0)}`);

  // 5. Assert correctness
  if (successfulRequests.length === 1 && failedRequests.length === 9 && finalStock?.reserved === 1) {
    console.log('\n✅ CONCURRENCY TEST PASSED: Exactly 1 reservation succeeded, and no stock was double-booked.');
  } else {
    console.error('\n❌ CONCURRENCY TEST FAILED: Stock level mismatch or multiple reservations succeeded.');
    process.exit(1);
  }
}

runConcurrencyTest()
  .catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
