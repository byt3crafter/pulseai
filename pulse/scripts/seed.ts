import { db } from "../src/storage/db.js";
import { tenants, channelConnections, allowlists } from "../src/storage/schema.js";
import { config } from "../src/config.js";
import { encrypt } from "../src/utils/crypto.js";

async function seed() {
    console.log("🌱 Seeding Demo Tenant...");

    try {
        const [demoTenant] = await db.insert(tenants).values({
            name: "Demo Business",
            slug: "demo-biz",
            config: {
                custom_instructions: "You are an AI assistant for a demo business. Your job is to show the client what you can do.",
                features_enabled: ["basic_chat"],
            },
        }).returning();

        console.log(`✅ Demo tenant created ID: ${demoTenant.id}`);

        // If a Developer Telegram Bot Token is exposed in ENV, set it up.
        if (process.env.TEST_TELEGRAM_BOT_TOKEN) {
            const [botConn] = await db.insert(channelConnections).values({
                tenantId: demoTenant.id,
                channelType: "telegram",
                channelConfig: {
                    // In production, things like botToken should be encrypted before going to DB,
                    // but for demo logic we drop it directly into jsonb config.
                    botToken: process.env.TEST_TELEGRAM_BOT_TOKEN
                },
            }).returning();

            console.log(`✅ Demo Telegram Channel attached: ${botConn.id}`);
        } else {
            console.log(`⚠️ Missing TEST_TELEGRAM_BOT_TOKEN in .env, skipping telegram seeding!`);
        }

        // Usually you seed an admin user here for the bot. If local testing, 
        // any contact hitting it without allowlist will just get blocked!
        if (process.env.TEST_YOUR_TELEGRAM_ID) {
            await db.insert(allowlists).values({
                tenantId: demoTenant.id,
                channelType: "telegram",
                contactId: process.env.TEST_YOUR_TELEGRAM_ID,
                contactName: "Admin User",
            });
            console.log(`✅ Developer ID ${process.env.TEST_YOUR_TELEGRAM_ID} allowlisted for bot.`);
        }

    } catch (err) {
        console.error("❌ Failed to seed:", err);
    } finally {
        process.exit(0);
    }
}

seed();
