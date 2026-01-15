import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/lib/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
});
