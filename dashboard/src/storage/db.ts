import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

// Uses a singleton connection throughout the app.
let queryClient;
try {
    // Attempt standard connection
    queryClient = postgres(config.DATABASE_URL);
} catch (error) {
    // If running in Docker CI/CD build phase, mock the db connection natively
    console.warn("⚠️ Postgres connection failed. Bypassing for build phase.");
    queryClient = postgres("postgres://postgres:postgres@localhost:5432/postgres", { max: 1 });
}

// Export the Drizzle DB instance
export const db = drizzle(queryClient, { schema });
