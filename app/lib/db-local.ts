import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

export type Database = ReturnType<typeof getDb>;

/**
 * Get Drizzle database instance for local development
 * Uses local SQLite database instead of Cloudflare D1
 */
export function getDb(d1?: any) {
  // For local development, use SQLite
  if (process.env.NODE_ENV === "development") {
    const sqlite = new Database("./dev.db");
    return drizzle(sqlite, { schema });
  }

  // For production, use Cloudflare D1
  return drizzle(d1, { schema });
}
