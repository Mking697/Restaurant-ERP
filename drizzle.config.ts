import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// DATABASE_URL is built in-memory from separate PG* env vars, never written to
// a file as one literal "scheme://user:pass@host" string (see .env.example).
const {
  PGHOST = "localhost",
  PGPORT = "5432",
  PGUSER = "postgres",
  PGPASSWORD = "",
  PGDATABASE = "restaurant_erp",
  PGSSLMODE = "disable", // "require" for Neon/managed Postgres, "disable" for local Docker
} = process.env;
// Keep credentials as separate driver fields; do not serialize a URL.

// Mirrors Pro ERP's drizzle.config.ts conventions (Mking697/Pro-ERP).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
    ssl: PGSSLMODE === "require" ? true : false,
  },
  strict: true,
  verbose: true,
});
