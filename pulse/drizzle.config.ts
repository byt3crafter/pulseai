import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/storage/schema.ts",
    out: "./src/storage/migrations",
    dbCredentials: {
        url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/pulse",
    },
});
