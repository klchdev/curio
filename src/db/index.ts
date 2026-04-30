import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { DATABASE_URL } from "astro:env/server";

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max: 3,
});

pool.on("error", (err) => {
  console.error("[pg pool] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
