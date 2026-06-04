import "dotenv/config";
import { defineConfig } from '@prisma/config';

export default defineConfig({
  migrations: {
    // This uses Next.js configuration directly instead of ts-node
    seed: 'npx next env npx tsx prisma/seed.ts',
  },
});