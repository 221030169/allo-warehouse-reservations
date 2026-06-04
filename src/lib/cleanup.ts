import { prisma } from './prisma';

/**
 * Finds all PENDING reservations that have passed their expiresAt time,
 * marks them as RELEASED, and returns the quantities back to available stock.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const now = new Date();
  
  try {
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
    });

    if (expiredReservations.length === 0) {
      return 0;
    }

    let releasedCount = 0;

    for (const res of expiredReservations) {
      try {
        await prisma.$transaction(async (tx) => {
          // Atomically update status only if still PENDING (prevents race with manual confirm/release)
          const updateResult = await tx.reservation.updateMany({
            where: {
              id: res.id,
              status: 'PENDING',
            },
            data: {
              status: 'RELEASED',
            },
          });

          // Only adjust stock levels if we actually performed the update
          if (updateResult.count > 0) {
            await tx.stock.update({
              where: {
                productId_warehouseId: {
                  productId: res.productId,
                  warehouseId: res.warehouseId,
                },
              },
              data: {
                reserved: {
                  decrement: res.quantity,
                },
              },
            });
            releasedCount++;
          }
        });
      } catch (err) {
        console.error(`[Cleanup] Error releasing expired reservation ${res.id}:`, err);
      }
    }

    if (releasedCount > 0) {
      console.log(`[Cleanup] Cleaned up ${releasedCount} expired reservations.`);
    }

    return releasedCount;
  } catch (error) {
    console.error('[Cleanup] Fatal error during reservation cleanup:', error);
    return 0;
  }
}
