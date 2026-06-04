import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanupExpiredReservations } from '@/lib/cleanup';

// Force dynamic execution to disable route caching in Next.js
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Perform lazy cleanup of expired reservations
    await cleanupExpiredReservations();

    // 2. Fetch products and their stocks
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // 3. Format response for the frontend
    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      price: Number(product.price),
      stocks: product.stocks.map((stock) => ({
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        quantity: stock.quantity,
        reserved: stock.reserved,
        available: Math.max(0, stock.quantity - stock.reserved),
      })),
    }));

    return NextResponse.json(formattedProducts);
  } catch (error) {
    console.error('[API Products] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
