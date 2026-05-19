import { z } from "zod";

const serverEnvSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  DATABASE_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default("CPA Awards <awards@example.com>"),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}

export function requireEnv(name: keyof z.infer<typeof serverEnvSchema>) {
  const value = getServerEnv()[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}
