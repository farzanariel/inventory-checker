import type { Config } from 'drizzle-kit';

export default {
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'data/data.db' },
} satisfies Config;
