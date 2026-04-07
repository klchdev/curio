import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../../backlog-roulette.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
