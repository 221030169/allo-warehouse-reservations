import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanupExpiredReservations } from '@/lib/cleanup';
import {
  checkOrLockIdempotency,
  saveIdempotencyResponse,
  releaseIdempotencyKey,
} from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get('idempotency-key');

  try {
    // 1. Check or lock idempotency
    const cachedResponse = await checkOrLockIdempotency(idempotencyKey);
    if (cachedResponse === 'IN_PROGRESS') {
      return NextResponse.json(
        { error: 'Request in progress. Please retry.' },
        { status: 409 }
      );
    } else if (cachedResponse) {
      return NextResponse.json(cachedResponse.body, { status: cachedResponse.status });
    }

    // 2. Perform lazy cleanup to free up any expired reservation stocks
    await cleanupExpiredReservations();

    // 3. Parse and validate body
    let body;
    try {
      body = await request.json();
    } catch {
      await releaseIdempotencyKey(idempotencyKey);
      const resBody = { error: 'Invalid JSON body' };
      await saveIdempotencyResponse(idempotencyKey, 400, resBody);
      return NextResponse.json(resBody, { status: 400 });
    }

    const { productId, warehouseId, quantity } = body;

    if (!productId || !warehouseId || typeof quantity !== 'number' || quantity <= 0) {
      await releaseIdempotencyKey(idempotencyKey);
      const resBody = { error: 'Missing or invalid fields: productId, warehouseId, quantity' };
      await saveIdempotencyResponse(idempotencyKey, 400, resBody);
      return NextResponse.json(resBody, { status: 400 });
    }

    // 4. Run database transaction to allocate stock atomically
    try {
      const reservation = await prisma.$transaction(async (tx) => {
        // Run atomic UPDATE using raw SQL.
        // This locks the Stock row and checks quantity - reserved >= quantity.
        const updatedRows = await tx.$executeRaw`
          UPDATE "Stock"
          SET "reserved" = "reserved" + ${quantity}
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
            AND "quantity" - "reserved" >= ${quantity}
        `;

        if (updatedRows === 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        // Create the reservation record
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes duration
        const newReservation = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: 'PENDING',
            expiresAt,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });

        return newReservation;
      });

      // 5. Successful reservation. Cache response and return.
      const formattedRes = {
        id: reservation.id,
        productId: reservation.productId,
        productName: reservation.product.name,
        warehouseId: reservation.warehouseId,
        warehouseName: reservation.warehouse.name,
        quantity: reservation.quantity,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
        createdAt: reservation.createdAt.toISOString(),
      };

      await saveIdempotencyResponse(idempotencyKey, 201, formattedRes);
      return NextResponse.json(formattedRes, { status: 201 });

    } catch (txError: any) {
      if (txError.message === 'INSUFFICIENT_STOCK') {
        // Stock not available. Release the idempotency lock (so client can retry)
        await releaseIdempotencyKey(idempotencyKey);
        const resBody = { error: 'Insufficient stock available for this product in the selected warehouse' };
        // We do NOT save a 409 in idempotency so that clients can try again once stock changes.
        return NextResponse.json(resBody, { status: 409 });
      }
      
      throw txError;
    }

  } catch (error) {
    console.error('[API Reservations] Error:', error);
    await releaseIdempotencyKey(idempotencyKey);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
