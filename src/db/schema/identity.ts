import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { userRoleEnum, userStatusEnum } from "@/db/schema/enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);
