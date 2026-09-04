import { int, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

/**
 * Internal auth user table kept for compatibility with the scaffold. RBXIS product
 * access is handled by productLicenses and signed rbxis_session cookies.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const productLicenses = mysqlTable("product_licenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 60 }).notNull().unique(),
  accessKey: varchar("accessKey", { length: 80 }).notNull().unique(),
  planId: varchar("planId", { length: 40 }).notNull(),
  durationValue: int("durationValue").notNull(),
  durationUnit: mysqlEnum("durationUnit", ["days", "weeks", "months", "years"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  status: mysqlEnum("status", ["active", "revoked", "blocked"]).default("active").notNull(),
  deviceId: varchar("deviceId", { length: 160 }),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductLicense = typeof productLicenses.$inferSelect;
export type InsertProductLicense = typeof productLicenses.$inferInsert;

export const sensitivityHistory = mysqlTable("sensitivity_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  licenseId: int("licenseId").notNull(),
  operatingSystem: mysqlEnum("operatingSystem", ["android", "ios"]).notNull(),
  device: varchar("device", { length: 100 }).notNull(),
  performance: mysqlEnum("performance", ["low", "medium", "high"]).notNull(),
  general: int("general").notNull(),
  redDot: int("redDot").notNull(),
  scope2x: int("scope2x").notNull(),
  scope4x: int("scope4x").notNull(),
  awm: int("awm").notNull(),
  favorite: tinyint("favorite").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SensitivityHistory = typeof sensitivityHistory.$inferSelect;
export type InsertSensitivityHistory = typeof sensitivityHistory.$inferInsert;
