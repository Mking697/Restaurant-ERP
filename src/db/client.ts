import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// DATABASE_URL is built in-memory from separate PG* env vars, never written to
// a file as one literal "scheme://user:pass@host" string — this Windows host's
// AV/DLP silently redacts that pattern wherever it is written. Keep this
// pattern in sync with drizzle.config.ts if either one changes.
const {
  PGHOST = "localhost",
  PGPORT = "5432",
  PGUSER = "postgres",
  PGPASSWORD = "",
  PGDATABASE = "restaurant_erp",
  PGSSLMODE = "disable",
} = process.env;

const pool = new Pool({
  host: PGHOST,
  port: Number(PGPORT),
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  ssl: PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
});

export const db = drizzle(pool, { schema });
