import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "./schema";

export type Database = ReturnType<typeof getDb>;

/**
 * Get Drizzle database instance from Cloudflare D1 binding
 *
 * Usage in loaders/actions:
 * ```ts
 * export async function loader({ context }: LoaderFunctionArgs) {
 *   const db = getDb(context?.cloudflare?.env?.DB);
 *   const events = await db.select().from(schema.events);
 *   return json({ events });
 * }
 * ```
 */
export function getDb(d1?: D1Database) {
  if (!d1) {
    throw new Error("D1 database not available. Make sure DB binding is configured.");
  }
  return drizzle(d1, { schema });
}
