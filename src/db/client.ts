import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/config/env";
import * as schema from "@/db/schema";

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Root drizzle connection. Transaction-scoped handles come from db.transaction. */
export const db = drizzle(sql, { schema });
