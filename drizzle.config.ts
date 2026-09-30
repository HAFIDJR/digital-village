import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url:  process.env.DATABASE_URL ?? "postgres://localhost:5432/digital_village" ,
  },
});
