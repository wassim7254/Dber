import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";

const DEV_URL = "postgres://dber:dber_dev_password@localhost:5432/dber";
export const TEST_URL = "postgres://dber:dber_dev_password@localhost:5432/dber_test";

/** Creates the test database (if needed) and applies all migrations once. */
export default async function globalSetup(): Promise<void> {
  const admin = postgres(DEV_URL, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE dber_test`);
    console.log("created database dber_test");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42P04") throw error; // 42P04 = duplicate_database
  } finally {
    await admin.end();
  }

  const sql = postgres(TEST_URL, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../src/db/migrations") });
  await sql.end();
  console.log("migrations applied to dber_test");
}
