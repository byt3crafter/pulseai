#!/usr/bin/env node
/**
 * Pulse AI Doctor CLI — diagnostic tool for system health checks.
 * Usage: npx tsx src/cli/doctor.ts [--json] [--fix]
 */

import * as dotenv from "dotenv";
dotenv.config();

import {
    checkDatabase,
    checkRedis,
    checkDocker,
    checkEncryptionKey,
    checkProviderKeys,
    checkWorkspaceDir,
    CheckResult,
} from "./doctor-checks.js";

const isJson = process.argv.includes("--json");

const COLORS = {
    pass: "\x1b[32m",  // green
    fail: "\x1b[31m",  // red
    warn: "\x1b[33m",  // yellow
    reset: "\x1b[0m",
    bold: "\x1b[1m",
};

function printResult(r: CheckResult) {
    if (isJson) return;
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "⚠";
    const color = COLORS[r.status];
    console.log(`  ${color}${icon}${COLORS.reset} ${COLORS.bold}${r.name}${COLORS.reset}: ${r.message}`);
    if (r.details) {
        console.log(`    ${COLORS.warn}${r.details}${COLORS.reset}`);
    }
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const workspaceDir = process.env.WORKSPACE_BASE_DIR || "../data/workspaces";

    if (!isJson) {
        console.log(`\n${COLORS.bold}Pulse AI Doctor${COLORS.reset}`);
        console.log("─".repeat(40));
    }

    const results: CheckResult[] = [];

    // Run all checks
    if (!databaseUrl) {
        results.push({ name: "Database", status: "fail", message: "DATABASE_URL not set" });
    } else {
        results.push(await checkDatabase(databaseUrl));
        results.push(await checkProviderKeys(databaseUrl));
    }

    results.push(await checkRedis(redisUrl));
    results.push(await checkEncryptionKey(encryptionKey));
    results.push(await checkDocker());
    results.push(await checkWorkspaceDir(workspaceDir));

    // Check required env vars
    const requiredVars = ["ANTHROPIC_API_KEY"];
    for (const v of requiredVars) {
        if (process.env[v]) {
            results.push({ name: `Env: ${v}`, status: "pass", message: "Set" });
        } else {
            results.push({ name: `Env: ${v}`, status: "fail", message: "Not set" });
        }
    }

    const optionalVars = ["OPENAI_API_KEY", "WEBHOOK_BASE_URL", "TELEGRAM_WEBHOOK_SECRET"];
    for (const v of optionalVars) {
        if (process.env[v]) {
            results.push({ name: `Env: ${v}`, status: "pass", message: "Set" });
        } else {
            results.push({ name: `Env: ${v}`, status: "warn", message: "Not set (optional)" });
        }
    }

    if (isJson) {
        console.log(JSON.stringify({ results, summary: summarize(results) }, null, 2));
    } else {
        for (const r of results) printResult(r);
        console.log("─".repeat(40));
        const summary = summarize(results);
        console.log(`  ${COLORS.pass}${summary.pass} passed${COLORS.reset}, ${COLORS.warn}${summary.warn} warnings${COLORS.reset}, ${COLORS.fail}${summary.fail} failed${COLORS.reset}\n`);
    }

    const hasFailures = results.some(r => r.status === "fail");
    process.exit(hasFailures ? 1 : 0);
}

function summarize(results: CheckResult[]) {
    return {
        pass: results.filter(r => r.status === "pass").length,
        warn: results.filter(r => r.status === "warn").length,
        fail: results.filter(r => r.status === "fail").length,
        total: results.length,
    };
}

main().catch((err) => {
    console.error("Doctor failed:", err);
    process.exit(1);
});
