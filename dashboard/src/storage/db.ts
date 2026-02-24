import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

// Uses a singleton connection throughout the app.
const queryClient = postgres(config.DATABASE_URL);

// Export the Drizzle DB instance
export const db = drizzle(queryClient, { schema });
