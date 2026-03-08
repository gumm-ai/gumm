import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './back/db/schema.ts',
  out: './back/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '.data/gumm.db',
  },
});
