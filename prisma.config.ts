import "dotenv/config";
import { defineConfig } from '@prisma/config';

export default defineConfig({
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    // This forces Prisma to read your Neon URL directly from your environment variables
    url: process.env.DATABASE_URL,
  },
});