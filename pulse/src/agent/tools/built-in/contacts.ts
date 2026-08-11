/**
 * Contact tools — a flexible address book for agents.
 *
 * The lookup source is per-tenant (tenants.config.contactsSource):
 *   - "native"  → the built-in `contacts` table (this workspace's own store)
 *   - "erpnext" → the client's ERPNext Contact doctype (when the ERPNext plugin
 *                  is connected) — no duplicate data
 *   - "auto"    → ERPNext if connected, else native  (default)
 * Writes (save/delete/list) operate on the native store; lookup honours the
 * configured source so "email <name>" resolves from wherever contacts live.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { contacts, tenants } from "../../../storage/schema.js";
import { and, eq, ilike, or, asc } from "drizzle-orm";
import { getErpNextCredentials, erpNextRequest } from "../../../../plugins/erpnext/client.js";

type Source = "native" | "erpnext";

async function resolveSource(tenantId: string, agentId?: string): Promise<Source> {
    let configured = "auto";
    try {
        const t = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { config: true } });
        const s = (t?.config as any)?.contactsSource;
        if (s === "native" || s === "erpnext" || s === "auto") configured = s;
    } catch { /* default */ }
    if (configured === "native") return "native";
    if (configured === "erpnext") return "erpnext";
    // auto: use ERPNext only when it's actually connected
    const creds = await getErpNextCredentials(tenantId, agentId).catch(() => null);
    return creds ? "erpnext" : "native";
}

type ContactRow = { name: string; email?: string | null; phone?: string | null; company?: string | null; title?: string | null; from: "ERPNext" | "address book" };

async function fetchErpNext(tenantId: string, agentId: string | undefined, q: string): Promise<ContactRow[] | null> {
    const creds = await getErpNextCredentials(tenantId, agentId).catch(() => null);
    if (!creds) return null;
    try {
        const like = `%${q}%`;
        const res = await erpNextRequest<any[]>(creds, "GET", "/api/resource/Contact", undefined, {
            or_filters: JSON.stringify([
                ["first_name", "like", like], ["last_name", "like", like],
                ["email_id", "like", like], ["company_name", "like", like],
            ]),
            fields: JSON.stringify(["name", "first_name", "last_name", "email_id", "mobile_no", "phone", "company_name"]),
            limit_page_length: "10",
        });
        const rows = (res as any)?.data;
        if (!Array.isArray(rows)) return null;
        return rows.map((r: any) => ({
            name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.name,
            email: r.email_id, phone: r.mobile_no || r.phone, company: r.company_name, from: "ERPNext" as const,
        }));
    } catch {
        return null; // ERPNext error → treated as "no ERPNext results", native still runs
    }
}

async function fetchNative(tenantId: string, q: string): Promise<ContactRow[]> {
    const like = `%${q}%`;
    const rows = await db.select().from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), or(ilike(contacts.name, like), ilike(contacts.email, like), ilike(contacts.company, like))))
        .orderBy(asc(contacts.name)).limit(10);
    return rows.map((c) => ({ name: c.name, email: c.email, phone: c.phone, company: c.company, title: c.title, from: "address book" as const }));
}

export const contactLookupTool: Tool = {
    name: "contact_lookup",
    source: "builtin",
    description:
        "Look up a person by name, email or company — use this to resolve who to email/call when the user says 'email <name>'. " +
        "Searches the built-in address book, plus ERPNext when the workspace is connected to it. Returns email, phone and company.",
    parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name, email, or company to search for." } },
        required: ["query"],
    },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide a name, email, or company to search for." };
        const agentId = typeof args?._agentId === "string" ? args._agentId : undefined;
        const source = await resolveSource(tenantId, agentId);

        const rows: ContactRow[] = [];
        // Search ERPNext when it's the configured/auto source; ALWAYS also search the
        // native store so contacts saved here are never missed.
        if (source === "erpnext") {
            const erp = await fetchErpNext(tenantId, agentId, q);
            if (erp) rows.push(...erp);
        }
        rows.push(...await fetchNative(tenantId, q));

        // De-dupe by email (or name when no email), keep the first (ERPNext wins).
        const seen = new Set<string>();
        const uniq = rows.filter((r) => { const k = (r.email || r.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        if (uniq.length === 0) return { result: `No contact matches "${q}".` };

        const lines = uniq.map((r) => {
            const bits = [r.email && `email: ${r.email}`, r.phone && `phone: ${r.phone}`, r.company && `company: ${r.company}`, r.title && `title: ${r.title}`].filter(Boolean);
            return `- ${r.name}${bits.length ? ` (${bits.join(", ")})` : ""} [${r.from}]`;
        });
        return { result: `Contacts matching "${q}":\n${lines.join("\n")}` };
    },
};

export const contactListTool: Tool = {
    name: "contact_list",
    source: "builtin",
    description: "List saved contacts in the built-in address book (name, email, phone, company).",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max to return (default 50)." } }, required: [] },
    execute: async ({ tenantId, args }) => {
        const limit = Math.max(1, Math.min(200, Number(args?.limit) || 50));
        const rows = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId)).orderBy(asc(contacts.name)).limit(limit);
        if (rows.length === 0) return { result: "No contacts saved yet." };
        const lines = rows.map((c) => `- ${c.name}${c.email ? ` <${c.email}>` : ""}${c.phone ? ` · ${c.phone}` : ""}${c.company ? ` · ${c.company}` : ""}`);
        return { result: `${rows.length} contact(s):\n${lines.join("\n")}` };
    },
};

export const contactSaveTool: Tool = {
    name: "contact_save",
    source: "builtin",
    description: "Add or update a contact in the built-in address book. If a contact with the same email (or exact name) exists, it's updated.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Full name (required)." },
            email: { type: "string", description: "Email address." },
            phone: { type: "string", description: "Phone number." },
            company: { type: "string", description: "Company / organisation." },
            title: { type: "string", description: "Job title / role." },
            notes: { type: "string", description: "Free-form notes." },
        },
        required: ["name"],
    },
    execute: async ({ tenantId, args }) => {
        const name = String(args?.name ?? "").trim();
        if (!name) return { result: "A name is required to save a contact." };
        const vals = {
            name,
            email: args?.email ? String(args.email).trim() : null,
            phone: args?.phone ? String(args.phone).trim() : null,
            company: args?.company ? String(args.company).trim() : null,
            title: args?.title ? String(args.title).trim() : null,
            notes: args?.notes ? String(args.notes) : null,
        };
        // Update an existing contact matched by email, else by exact name.
        const match = await db.select({ id: contacts.id }).from(contacts)
            .where(and(eq(contacts.tenantId, tenantId), vals.email ? eq(contacts.email, vals.email) : eq(contacts.name, name)))
            .limit(1);
        if (match[0]) {
            await db.update(contacts).set({ ...vals, updatedAt: new Date() }).where(eq(contacts.id, match[0].id));
            return { result: `Updated contact: ${name}.` };
        }
        await db.insert(contacts).values({ tenantId, ...vals });
        return { result: `Saved contact: ${name}.` };
    },
};

export const contactDeleteTool: Tool = {
    name: "contact_delete",
    source: "builtin",
    description: "Delete a contact from the built-in address book by name or email.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or email of the contact to delete." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide the name or email of the contact to delete." };
        const rows = await db.select({ id: contacts.id, name: contacts.name }).from(contacts)
            .where(and(eq(contacts.tenantId, tenantId), or(eq(contacts.name, q), eq(contacts.email, q))))
            .limit(5);
        if (rows.length === 0) return { result: `No contact found matching "${q}".` };
        if (rows.length > 1) return { result: `"${q}" matches ${rows.length} contacts — be more specific (use the exact email).` };
        await db.delete(contacts).where(eq(contacts.id, rows[0].id));
        return { result: `Deleted contact: ${rows[0].name}.` };
    },
};
