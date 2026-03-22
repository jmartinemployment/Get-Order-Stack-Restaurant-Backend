import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // DIRECT_URL for migrations (non-pooled, required by Prisma Migrate)
    // Falls back to DATABASE_URL if DIRECT_URL is not set
    url: env('DIRECT_URL') ?? env('DATABASE_URL'),
  },
});
