# Allo Warehouse Inventory Reservation System

A premium, concurrency-safe, and idempotent inventory reservation system built with **Next.js (App Router)**, **Prisma**, and **PostgreSQL (Neon)**. 

This platform prevents stock overselling by holding inventory temporarily for a 10-minute window while checkout/payment is completed.

---

## Technical Stack & Architecture

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Database Layer**: Prisma 7 (Rust-free client architecture with a connection pool adapter over `pg`)
- **Hosted Database**: Neon (PostgreSQL serverless instance)
- **Styling**: Tailwind CSS v4, Lucide React Icons
- **Animations**: Framer Motion
- **Special Effects**: Canvas Confetti (celebrates completed checkouts!)

---

## Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v24+ recommended)
- **npm**: v9.0.0 or higher

### 2. Environment Variables Setup
Create a `.env` file in the root directory (a `.env.local` can also be used, but standard scripts look for `.env`). Add the connection string for your hosted database:

```env
DATABASE_URL="postgresql://neondb_owner:npg_5M6hwNrHqSgZ@ep-morning-surf-ajkdqhuq-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

> [!NOTE]
> During development, we provisioned a free Neon database which is currently active. The connection string is pre-configured and ready to use.

### 3. Install Dependencies
```bash
npm install
```

### 4. Push Database Schema & Generate Prisma Client
Since Prisma 7 utilizes a Rust-free client architecture, we must generate the client output into our source tree:
```bash
# Push schema tables to the hosted PostgreSQL database
npx prisma db push

# Generate the custom client bundle
npx prisma generate
```

### 5. Seed the Database
Seed the database with pre-configured products, warehouses, and varying stock levels:
```bash
npx tsx prisma/seed.ts
```
*This seeds 4 products (including one with exactly 1 unit left for concurrency testing) and 3 warehouses (New York, Chicago, Los Angeles).*

### 6. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the catalog.

---

## Core Engineering Designs

### 1. Correctness Under Concurrency (Race-Condition Free)
The core of this system is preventing two customers from reserving the same final physical stock unit simultaneously. To achieve this without complex distributed locks (like Redis locks), we utilize **PostgreSQL row-level locking via atomic update queries**.

When a reservation request comes in, we run a Prisma transaction containing a raw PostgreSQL update:
```sql
UPDATE "Stock"
SET "reserved" = "reserved" + $quantity
WHERE "productId" = $productId
  AND "warehouseId" = $warehouseId
  AND "quantity" - "reserved" >= $quantity
```
**Why this is safe:**
1. In PostgreSQL, executing an `UPDATE` statement automatically acquires a row-level write lock (`FOR UPDATE` lock) on the matched stock row.
2. Concurrent requests trying to write to the same stock row are serialized; they must wait for the first transaction to commit or roll back.
3. Once the first transaction commits (having incremented `reserved`), the second transaction re-evaluates the query conditions against the newly committed state.
4. If the available stock (`quantity - reserved`) is no longer sufficient, the update affects `0` rows.
5. In Node.js, we check the number of affected rows. If it is `0`, we throw an error, rolling back the transaction and returning a `409 Conflict` (Insufficient Stock) to the second user. Exactly one reservation succeeds.

### 2. Database-Backed Idempotency (Bonus)
We implemented a robust database-backed idempotency layer for `POST /api/reservations` and `POST /api/reservations/:id/confirm`.

- When a client sends a request with an `Idempotency-Key` header, we attempt to insert a record into the `Idempotency` table with a state of `202 (In Progress)`.
- If the insert **succeeds**, we proceed to process the transaction. Once complete, we update the idempotency record with the final response status and JSON body.
- If the insert **fails** due to a primary key conflict (unique key constraint violation):
  - If the existing record is in state `202`, it means another concurrent request with the same key is still processing. We return `409 Conflict` ("Request in progress") to prevent double execution.
  - If the existing record has a completed status, we parse and return the cached response immediately, avoiding repeating the side-effects.
- If the reservation fails due to validation or stock issues, we delete the key so the client is allowed to correct their inputs and retry.

### 3. Expiry Mechanism in Production
Holds are configured to expire after 10 minutes. We clean up expired holds using two complementary mechanisms:
1. **Lazy Cleanup on Read/Write**: Whenever a user queries the product catalog (`GET /api/products`) or tries to create a reservation (`POST /api/reservations`), the system runs a fast query that finds expired `PENDING` reservations and marks them as `RELEASED`, restoring the reserved stock to availability. This guarantees stock levels are 100% accurate at checkout/read time.
2. **Background Cron Worker**: We implemented a dedicated API endpoint at `/api/cleanup`. In production, a **Vercel Cron job** or **GitHub Action** triggers this endpoint (secured with a `CRON_SECRET` header token) every minute to sweep and release expired reservations in the background.

---

## Testing Concurrency Safety
We included an automated script to simulate heavy concurrent traffic and prove race-condition safety.
```bash
npx tsx scripts/test-concurrency.ts
```
**What the test does:**
1. Resets the stock of "Quantum Headphones" in the New York warehouse to exactly **1 unit**.
2. Fires **10 parallel transactions** to reserve that 1 unit simultaneously.
3. Verifies that **exactly 1** request succeeds and **exactly 9** fail with insufficient stock.
4. Confirms that final database stock has exactly `1 reserved` unit and `0 available`.

---

## Trade-offs & Future Considerations
1. **Database Connection Limits**: In highly scaled serverless environments, opening direct database pools can exhaust PostgreSQL connection limits. In production, we would use a connection pooler like **PgBouncer** or the **Neon Connection Pooler** (which we used via `-pooler` connection strings in production Vercel environments).
2. **WebSockets/Server-Sent Events for Live Updates**: Currently, the UI relies on manual refreshes or redirect triggers to see changes in catalog stock levels. With more time, we would implement SSE (Server-Sent Events) or WebSockets to stream catalog updates in real-time to other shoppers.
3. **Partitioned Inventory**: For massive global brands, holding locks on a single database row can lead to high transaction queueing. We could partition inventory (e.g. split stock into smaller lockable blocks) to scale throughput.
