/**
 * Expense tools — a simple expense/receipt ledger the agent can record and total.
 * Dates are interpreted in the workspace timezone. Receipt file attachment is a
 * dashboard/Phase-2 concern; these tools handle the expense records themselves.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { expenses } from "../../../storage/schema.js";
import { and, eq, gte, lte, desc, ilike, or } from "drizzle-orm";
import { getTenantTimezone, parseZonedDate, formatInTz } from "../tz-util.js";

const money = (amount: string | null, currency: string | null) =>
    `${currency ? currency + " " : ""}${Number(amount ?? 0).toFixed(2)}`;

export const expenseAddTool: Tool = {
    name: "expense_add",
    source: "builtin",
    description: "Record an expense. Amount is required; vendor, category, currency, description and date are optional (date in workspace timezone, defaults to now).",
    parameters: {
        type: "object",
        properties: {
            amount: { type: "number", description: "Amount spent." },
            currency: { type: "string", description: "Currency code, e.g. BWP, USD." },
            vendor: { type: "string", description: "Who it was paid to." },
            category: { type: "string", description: "Category, e.g. Travel, Fuel, Software." },
            description: { type: "string", description: "What it was for." },
            date: { type: "string", description: "When it was spent, e.g. '2026-08-10' (workspace timezone)." },
        },
        required: ["amount"],
    },
    execute: async ({ tenantId, args }) => {
        const amt = Number(args?.amount);
        if (!Number.isFinite(amt) || amt < 0) return { result: "Provide a valid expense amount." };
        const tz = await getTenantTimezone(tenantId);
        const spentAt = args?.date ? parseZonedDate(args.date, tz) : new Date();
        const res = await db.insert(expenses).values({
            tenantId,
            amount: amt.toFixed(2),
            currency: args?.currency ? String(args.currency).slice(0, 8) : null,
            vendor: args?.vendor ? String(args.vendor).slice(0, 300) : null,
            category: args?.category ? String(args.category).slice(0, 120) : null,
            description: args?.description ? String(args.description).slice(0, 1000) : null,
            spentAt: spentAt ?? new Date(),
        }).returning({ id: expenses.id });
        return { result: `Recorded expense ${money(amt.toFixed(2), args?.currency ?? null)}${args?.vendor ? ` to ${args.vendor}` : ""} [id: ${res[0].id}]` };
    },
};

export const expenseListTool: Tool = {
    name: "expense_list",
    source: "builtin",
    description: "List expenses (optionally filtered by category and date range) with a total.",
    parameters: {
        type: "object",
        properties: {
            category: { type: "string", description: "Only this category." },
            from: { type: "string", description: "Start date (workspace timezone)." },
            to: { type: "string", description: "End date (workspace timezone)." },
            limit: { type: "number", description: "Max rows (default 50)." },
        },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const tz = await getTenantTimezone(tenantId);
        const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
        const conds = [eq(expenses.tenantId, tenantId)];
        if (args?.category) conds.push(eq(expenses.category, String(args.category)));
        const from = args?.from ? parseZonedDate(args.from, tz) : null;
        const to = args?.to ? parseZonedDate(args.to, tz) : null;
        if (from) conds.push(gte(expenses.spentAt, from));
        if (to) conds.push(lte(expenses.spentAt, to));
        const rows = await db.select().from(expenses).where(and(...conds)).orderBy(desc(expenses.spentAt)).limit(limit);
        if (rows.length === 0) return { result: "No expenses recorded for that filter." };
        const lines = rows.map((r) =>
            `- ${r.spentAt ? formatInTz(r.spentAt, tz, { dateOnly: true }) : "?"} — ${money(r.amount, r.currency)}${r.vendor ? ` · ${r.vendor}` : ""}${r.category ? ` · ${r.category}` : ""}${r.description ? ` — ${r.description}` : ""} [id: ${r.id}]`);
        const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
        const cur = rows[0]?.currency ? rows[0].currency + " " : "";
        return { result: `Expenses (${rows.length}):\n${lines.join("\n")}\n\nTotal (listed): ${cur}${total.toFixed(2)}` };
    },
};

export const expenseSearchTool: Tool = {
    name: "expense_search",
    source: "builtin",
    description: "Search expenses by keyword in vendor, category or description.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Text to search for." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide a search query." };
        const like = `%${q}%`;
        const tz = await getTenantTimezone(tenantId);
        const rows = await db.select().from(expenses)
            .where(and(eq(expenses.tenantId, tenantId), or(ilike(expenses.vendor, like), ilike(expenses.category, like), ilike(expenses.description, like))))
            .orderBy(desc(expenses.spentAt)).limit(50);
        if (rows.length === 0) return { result: `No expenses matching "${q}".` };
        const lines = rows.map((r) => `- ${r.spentAt ? formatInTz(r.spentAt, tz, { dateOnly: true }) : "?"} — ${money(r.amount, r.currency)}${r.vendor ? ` · ${r.vendor}` : ""} [id: ${r.id}]`);
        return { result: `Expenses matching "${q}" (${rows.length}):\n${lines.join("\n")}` };
    },
};

export const expenseDeleteTool: Tool = {
    name: "expense_delete",
    source: "builtin",
    description: "Delete an expense by its id.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The expense id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the expense id." };
        const res = await db.delete(expenses).where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id))).returning({ id: expenses.id });
        return { result: res[0] ? `Expense ${id} deleted.` : `No expense found with id ${id}.` };
    },
};
