import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.url(),
  /** The only origin browsers talk to — Next proxies /api/* here (C2). */
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Dev seed only: fetches demo photos from the official Unsplash API. */
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
  /** Set to 0 to run the API without the closer/outbox loops (e.g. a second instance in tests). */
  RUN_WORKERS: z.coerce.number().int().min(0).max(1).default(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  googleEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
};
