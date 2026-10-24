import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from root or local backend folder
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to local directory .env

export const DEV_JWT_PLACEHOLDER = 'brandguard-dev-super-secret-jwt-key-change-in-production-32bytes';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000').transform(Number),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    AI_SERVICE_URL: z.string().default('http://localhost:8000'),
    MONGODB_URI: z.string().optional().default(''),
    JWT_SECRET: z.string().min(16).default(DEV_JWT_PLACEHOLDER),
    JWT_EXPIRES_IN: z.string().default('24h'),
    AI_SERVICE_API_KEY: z.string().default('brandguard-internal-secret-service-key-12345'),
    ALLOW_AUTO_SEED: z
      .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
      .default(false),
    ALLOW_PUBLIC_REGISTRATION: z
      .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
      .default(true),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.MONGODB_URI || data.MONGODB_URI.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MONGODB_URI is required and cannot be empty when NODE_ENV=production.',
          path: ['MONGODB_URI'],
        });
      }

      if (!data.JWT_SECRET || data.JWT_SECRET.length < 32 || data.JWT_SECRET === DEV_JWT_PLACEHOLDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET must be a unique, secure secret of at least 32 characters in production (cannot use development placeholder).',
          path: ['JWT_SECRET'],
        });
      }

      if (!data.FRONTEND_URL || data.FRONTEND_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'FRONTEND_URL is required in production.',
          path: ['FRONTEND_URL'],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variable configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
