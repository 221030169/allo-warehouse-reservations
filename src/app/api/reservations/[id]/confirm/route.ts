import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  checkOrLockIdempotency,
  saveIdempotencyResponse,
  releaseIdempotencyKey,
} from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
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

    // 2. Process reservation confirmation in a transaction
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Query reservation
        const reservation = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: true,
            warehouse: true,
          },
        });

        if (!reservation) {
          return { error: 'Reservation not found', status: 404 };
        }

        // If already confirmed, return success (Idempotent response)
        if (reservation.status === 'CONFIRMED') {
          return { reservation, status: 200 };
        }

        // If already released, or expired
        const now = new Date();
        if (reservation.status === 'RELEASED' || reservation.expiresAt < now) {
          // If expired but still marked PENDING in DB, release it now
          if (reservation.status === 'PENDING') {
            await tx.reservation.update({
              where: { id },
              data: { status: 'RELEASED' },
            });
            // Revert reserved stock
            await tx.stock.update({
              where: {
                productId_warehouseId: {
                  productId: reservation.productId,
                  warehouseId: reservation.warehouseId,
                },
              },
              data: {
                reserved: { decrement: reservation.quantity },
              },
            });
          }
          return { error: 'Reservation has expired or has already been released', status: 410 };
        }

        // Confirm reservation and adjust stock
        const updatedReservation = await tx.reservation.update({
          where: { id },
          data: { status: 'CONFIRMED' },
          include: {
            product: true,
            warehouse: true,
          },
        });

        // Decrement both total quantity and reserved quantity in stock
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            quantity: { decrement: reservation.quantity },
            reserved: { decrement: reservation.quantity },
          },
        });

        return { reservation: updatedReservation, status: 200 };
      });

      // 3. Format response
      if ('error' in result) {
        // For non-success, release idempotency key so client can correct actions
        await releaseIdempotencyKey(idempotencyKey);
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      const formattedRes = {
        id: result.reservation.id,
        productId: result.reservation.productId,
        productName: result.reservation.product.name,
        warehouseId: result.reservation.warehouseId,
        warehouseName: result.reservation.warehouse.name,
        quantity: result.reservation.quantity,
        status: result.reservation.status,
        expiresAt: result.reservation.expiresAt.toISOString(),
        createdAt: result.reservation.createdAt.toISOString(),
      };

      // 4. Save response in idempotency cache
      await saveIdempotencyResponse(idempotencyKey, 200, formattedRes);
      return NextResponse.json(formattedRes, { status: 200 });

    } catch (txError) {
      await releaseIdempotencyKey(idempotencyKey);
      throw txError;
    }

  } catch (error) {
    console.error(`[API Confirm Reservation ${id}] Error:`, error);
    await releaseIdempotencyKey(idempotencyKey);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
