import { defineConfig } from "drizzle-kit";

// 結構變更流程：改 lib/schema.ts → npm run db:generate → 檢查產出的 SQL → npm run db:migrate
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
