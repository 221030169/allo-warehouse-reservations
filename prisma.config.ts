import "dotenv/config";
import { defineConfig } from '@prisma/config';

export default defineConfig({
  migrations: {
    // This tells Prisma to execute your seed file using ts-node
    seed: 'npx ts-node prisma/seed.ts',
  },
});
