import { db } from "@/db/client";

/**
 * The transaction handle passed to application services. Derived from the
 * concrete drizzle instance so repository functions accept exactly what
 * `db.transaction` provides — no `any`, no hand-written structural type.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the root connection (for single-statement reads) or a transaction. */
export type DbExecutor = typeof db | Tx;
