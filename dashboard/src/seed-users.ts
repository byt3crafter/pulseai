import { db } from "./storage/db";
import { users } from "./storage/schema";
import bcrypt from "bcryptjs";

async function seed() {
    console.log("Seeding initial root admin user...");

    // Hash password 'pulseadmin2026'
    const passwordHash = await bcrypt.hash("pulseadmin2026", 10);

    try {
        await db.insert(users).values({
            email: "admin@runstate.com",
            passwordHash,
            name: "Super Administrator",
            role: "ADMIN"
        });
        console.log("✅ Root Admin seeded successfully!");
        console.log("Email: admin@runstate.com");
        console.log("Pass:  pulseadmin2026");
    } catch (e: any) {
        if (e.code === '23505') { // Unique constraint violation
            console.log("⚠️ Root admin already exists.");
        } else {
            console.error(e);
        }
    }
    process.exit(0);
}

seed();
