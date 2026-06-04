import { prisma } from './prisma';

export interface IdempotentResult {
  status: number;
  body: any;
}

/**
 * Validates and locks an idempotency key.
 * 
 * Returns:
 * - `null` if the key is new and has been successfully registered (caller should proceed).
 * - `'IN_PROGRESS'` if the request is already being processed concurrently.
 * - `IdempotentResult` containing the cached status and body if the request was already processed.
 */
export async function checkOrLockIdempotency(
  key: string | null
): Promise<IdempotentResult | 'IN_PROGRESS' | null> {
  if (!key || key.trim() === '') {
    return null;
  }

  try {
    // Try to register the key. A responseStatus of 202 marks it as "in progress".
    await prisma.idempotency.create({
      data: {
        key,
        responseStatus: 202,
        responseBody: JSON.stringify({ error: 'Request in progress' }),
      },
    });
    
    // Key created successfully. Proceed with request.
    return null;
  } catch (error: any) {
    // P2002 is Prisma's code for unique constraint violation
    if (error.code === 'P2002') {
      const existing = await prisma.idempotency.findUnique({
        where: { key },
      });

      if (existing) {
        if (existing.responseStatus === 202) {
          return 'IN_PROGRESS';
        }
        
        try {
          return {
            status: existing.responseStatus,
            body: JSON.parse(existing.responseBody),
          };
        } catch {
          return {
            status: existing.responseStatus,
            body: { raw: existing.responseBody },
          };
        }
      }
    }
    
    // For other DB issues, propagate the error
    throw error;
  }
}

/**
 * Updates the idempotency record with the final response status and body.
 */
export async function saveIdempotencyResponse(
  key: string | null,
  status: number,
  body: any
): Promise<void> {
  if (!key || key.trim() === '') {
    return;
  }

  try {
    await prisma.idempotency.update({
      where: { key },
      data: {
        responseStatus: status,
        responseBody: JSON.stringify(body),
      },
    });
  } catch (error) {
    console.error(`[Idempotency] Failed to save final response for key "${key}":`, error);
  }
}

/**
 * Removes the idempotency key if processing failed, allowing the client to retry.
 */
export async function releaseIdempotencyKey(key: string | null): Promise<void> {
  if (!key || key.trim() === '') {
    return;
  }

  try {
    await prisma.idempotency.deleteMany({
      where: {
        key,
        responseStatus: 202, // Only delete if it's still in-progress
      },
    });
  } catch (error) {
    console.error(`[Idempotency] Failed to release key "${key}":`, error);
  }
}
