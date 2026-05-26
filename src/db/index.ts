import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: Database | null = null;

function resolveDatabaseUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL;
}

export function hasDatabaseUrl() {
  return Boolean(resolveDatabaseUrl());
}

export function getDatabaseUrl() {
  const databaseUrl = resolveDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  return databaseUrl;
}

export function getDb() {
  if (!cachedDb) {
    cachedDb = drizzle(neon(getDatabaseUrl()), { schema });
  }

  return cachedDb;
}

export { schema };
