"use server";

import { and, eq, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { contacts, tenants } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

export interface ContactRow {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    title: string | null;
    notes: string | null;
}

export type ContactsSource = "auto" | "native" | "erpnext";
const CONTACTS_SOURCES: ContactsSource[] = ["auto", "native", "erpnext"];

/** List the tenant's contacts, alphabetically by name. Returns [] on auth failure. */
export async function getContacts(): Promise<ContactRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: contacts.id,
            name: contacts.name,
            email: contacts.email,
            phone: contacts.phone,
            company: contacts.company,
            title: contacts.title,
            notes: contacts.notes,
        })
            .from(contacts)
            .where(eq(contacts.tenantId, tenantId))
            .orderBy(asc(contacts.name));
        return rows;
    } catch (error) {
        console.error("Failed to load contacts:", error);
        return [];
    }
}

/** Create or update a contact (edit when `id` is present). */
export async function saveContactAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const name = ((formData.get("name") as string) || "").trim();
    const email = ((formData.get("email") as string) || "").trim();
    const phone = ((formData.get("phone") as string) || "").trim();
    const company = ((formData.get("company") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();

    if (!name) return { success: false, message: "Name is required." };

    try {
        if (id) {
            const [updated] = await db.update(contacts)
                .set({
                    name,
                    email: email || null,
                    phone: phone || null,
                    company: company || null,
                    title: title || null,
                    notes: notes || null,
                    updatedAt: new Date(),
                })
                .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
                .returning({ id: contacts.id });

            if (!updated) return { success: false, message: "Contact not found." };
        } else {
            await db.insert(contacts).values({
                tenantId,
                name,
                email: email || null,
                phone: phone || null,
                company: company || null,
                title: title || null,
                notes: notes || null,
            });
        }

        await logAudit({
            action: "contact.save",
            targetType: "contact",
            targetId: name,
            tenantId,
            summary: `Saved contact "${name}"`,
            metadata: { email: email || undefined },
        });

        revalidatePath("/dashboard/contacts");
        return { success: true, message: id ? "Contact updated." : "Contact added." };
    } catch (error) {
        console.error("Failed to save contact:", error);
        return { success: false, message: "Failed to save contact." };
    }
}

/** Delete a contact by id, scoped to the tenant. */
export async function deleteContactAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Contact id is required." };

    try {
        const [existing] = await db.select({ name: contacts.name })
            .from(contacts)
            .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
            .limit(1);

        await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));

        await logAudit({
            action: "contact.delete",
            targetType: "contact",
            targetId: id,
            tenantId,
            summary: `Deleted contact "${existing?.name ?? id}"`,
        });

        revalidatePath("/dashboard/contacts");
        return { success: true, message: "Contact deleted." };
    } catch (error) {
        console.error("Failed to delete contact:", error);
        return { success: false, message: "Failed to delete contact." };
    }
}

/** Read the tenant's configured contacts source (defaults to "auto"). */
export async function getContactsSource(): Promise<ContactsSource> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return "auto";
    const tenantId = tenantCheck.tenantId;

    try {
        const [row] = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const source = (row?.config as any)?.contactsSource;
        return CONTACTS_SOURCES.includes(source) ? source : "auto";
    } catch (error) {
        console.error("Failed to load contacts source:", error);
        return "auto";
    }
}

/** Persist which system feeds a workspace's contacts — the built-in store, ERPNext, or auto-detect. */
export async function saveContactsSourceAction(source: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!CONTACTS_SOURCES.includes(source as ContactsSource)) {
        return { success: false, message: "Invalid contacts source." };
    }

    try {
        await db.execute(
            sql`UPDATE tenants SET config = config || ${JSON.stringify({ contactsSource: source })}::jsonb, updated_at = now() WHERE id = ${tenantId}::uuid`
        );

        await logAudit({
            action: "contact.source.update",
            targetType: "tenant",
            targetId: tenantId,
            tenantId,
            summary: `Set contacts source to "${source}"`,
            metadata: { source },
        });

        revalidatePath("/dashboard/contacts");
        return { success: true, message: "Contacts source saved." };
    } catch (error) {
        console.error("Failed to save contacts source:", error);
        return { success: false, message: "Failed to save contacts source." };
    }
}
