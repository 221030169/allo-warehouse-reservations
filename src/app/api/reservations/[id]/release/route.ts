import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = await params;
  const id = resolvedParams.id;

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

      // If already released, return success (Idempotent response)
      if (reservation.status === 'RELEASED') {
        return { reservation, status: 200 };
      }

      // Cannot release a confirmed reservation
      if (reservation.status === 'CONFIRMED') {
        return { error: 'Cannot release a confirmed reservation', status: 400 };
      }

      // Release reservation and adjust stock
      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
        include: {
          product: true,
          warehouse: true,
        },
      });

      // Decrement only reserved quantity in stock (frees up the stock)
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

      return { reservation: updatedReservation, status: 200 };
    });

    if ('error' in result) {
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

    return NextResponse.json(formattedRes, { status: 200 });

  } catch (error) {
    console.error(`[API Release Reservation ${id}] Error:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
