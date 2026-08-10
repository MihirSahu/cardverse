import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

import * as schema from "@/lib/db/schema";

const configuredDatabasePath = process.env.CARDVERSE_DB_PATH;
const databasePath = configuredDatabasePath
  ? path.isAbsolute(configuredDatabasePath)
    ? configuredDatabasePath
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredDatabasePath)
  : path.join(process.cwd(), "data", "cardverse.db");

function createDatabase() {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

type DatabaseState = {
  database: ReturnType<typeof createDatabase> | null;
  migrationsApplied: boolean;
};

const databaseGlobal = globalThis as typeof globalThis & {
  __cardverseDatabase?: DatabaseState;
};

const databaseState = databaseGlobal.__cardverseDatabase ??= {
  database: null,
  migrationsApplied: false,
};

export function getDatabase() {
  databaseState.database ??= createDatabase();

  if (!databaseState.migrationsApplied) {
    migrate(databaseState.database, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    databaseState.migrationsApplied = true;
  }

  return databaseState.database;
}

export function getDatabasePath() {
  return databasePath;
}
