"use server";

import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { documents, expenses } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "../documents/document-file";

export interface ExpenseRow {
    id: string;
    amount: string;
    currency: string | null;
    vendor: string | null;
    category: string | null;
    description: string | null;
    spentAt: Date | null;
    receiptDocumentId: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** List the tenant's expenses, most recently spent first. Returns [] on auth failure. */
export async function getExpenses(): Promise<ExpenseRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: expenses.id,
            amount: expenses.amount,
            currency: expenses.currency,
            vendor: expenses.vendor,
            category: expenses.category,
            description: expenses.description,
            spentAt: expenses.spentAt,
            receiptDocumentId: expenses.receiptDocumentId,
            createdAt: expenses.createdAt,
            updatedAt: expenses.updatedAt,
        })
            .from(expenses)
            .where(eq(expenses.tenantId, tenantId))
            .orderBy(asc(expenses.spentAt));
        // Most recent spend first; undated expenses (spentAt null) sort last.
        return rows.sort((a, b) => {
            if (!a.spentAt && !b.spentAt) return 0;
            if (!a.spentAt) return 1;
            if (!b.spentAt) return -1;
            return new Date(b.spentAt).getTime() - new Date(a.spentAt).getTime();
        });
    } catch (error) {
        console.error("Failed to load expenses:", error);
        return [];
    }
}

/** Create or update an expense (edit when `id` is present). */
export async function saveExpenseAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const amountRaw = ((formData.get("amount") as string) || "").trim();
    const currency = ((formData.get("currency") as string) || "").trim();
    const vendor = ((formData.get("vendor") as string) || "").trim();
    const category = ((formData.get("category") as string) || "").trim();
    const description = ((formData.get("description") as string) || "").trim();
    const date = ((formData.get("date") as string) || "").trim();

    if (!amountRaw) return { success: false, message: "Amount is required." };
    const amountNum = Number(amountRaw);
    if (!Number.isFinite(amountNum)) return { success: false, message: "Amount must be a number." };

    let spentAt: Date | null = null;
    if (date) {
        const parsed = new Date(date);
        if (!Number.isNaN(parsed.getTime())) spentAt = parsed;
    }

    try {
        if (id) {
            const [updated] = await db.update(expenses)
                .set({
                    amount: amountNum.toFixed(2),
                    currency: currency || null,
                    vendor: vendor || null,
                    category: category || null,
                    description: description || null,
                    spentAt,
                    updatedAt: new Date(),
                })
                .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
                .returning({ id: expenses.id });

            if (!updated) return { success: false, message: "Expense not found." };
        } else {
            await db.insert(expenses).values({
                tenantId,
                amount: amountNum.toFixed(2),
                currency: currency || null,
                vendor: vendor || null,
                category: category || null,
                description: description || null,
                spentAt,
            });
        }

        await logAudit({
            action: "expense.save",
            targetType: "expense",
            targetId: id || vendor || undefined,
            tenantId,
            summary: `Saved expense${vendor ? `: ${vendor}` : ""}`,
        });

        revalidatePath("/dashboard/expenses");
        return { success: true, message: id ? "Expense updated." : "Expense added." };
    } catch (error) {
        console.error("Failed to save expense:", error);
        return { success: false, message: "Failed to save expense." };
    }
}

/** Delete an expense by id, scoped to the tenant. */
export async function deleteExpenseAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Expense id is required." };

    try {
        const [existing] = await db.select({ vendor: expenses.vendor })
            .from(expenses)
            .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
            .limit(1);

        await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)));

        await logAudit({
            action: "expense.delete",
            targetType: "expense",
            targetId: id,
            tenantId,
            summary: `Deleted expense${existing?.vendor ? `: ${existing.vendor}` : ""}`,
        });

        revalidatePath("/dashboard/expenses");
        return { success: true, message: "Expense deleted." };
    } catch (error) {
        console.error("Failed to delete expense:", error);
        return { success: false, message: "Failed to delete expense." };
    }
}

/**
 * Attach a receipt to an expense: uploads the file into the shared document
 * locker (source 'receipt') and points the expense's `receiptDocumentId` at
 * the new row. Both writes are scoped to the caller's tenant.
 */
export async function attachReceiptAction(expenseId: string, formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!expenseId) return { success: false, message: "Expense id is required." };

    const dataBase64 = ((formData.get("dataBase64") as string) || "").trim();
    const filename = ((formData.get("filename") as string) || "receipt").trim() || "receipt";
    const mimeType = ((formData.get("mimeType") as string) || "").trim() || "application/octet-stream";
    if (!dataBase64) {
        return { success: false, message: "Please choose a receipt file to upload." };
    }

    try {
        const [existing] = await db.select({ id: expenses.id, vendor: expenses.vendor })
            .from(expenses)
            .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
            .limit(1);
        if (!existing) return { success: false, message: "Expense not found." };

        const buf = Buffer.from(dataBase64, "base64");
        if (!buf.length) return { success: false, message: "The file appears to be empty." };
        if (buf.length > MAX_DOCUMENT_BYTES) {
            return { success: false, message: "File is too large. The limit is 10 MB." };
        }

        const extractedText = await extractDocumentText(buf, mimeType, filename);

        const [doc] = await db.insert(documents).values({
            tenantId,
            filename,
            mimeType,
            sizeBytes: buf.length,
            content: buf.toString("base64"),
            extractedText,
            title: `Receipt: ${existing.vendor || filename}`,
            source: "receipt",
        }).returning({ id: documents.id });

        await db.update(expenses)
            .set({ receiptDocumentId: doc.id, updatedAt: new Date() })
            .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)));

        await logAudit({
            action: "expense.receipt",
            targetType: "expense",
            targetId: expenseId,
            tenantId,
            summary: `Attached receipt to expense${existing.vendor ? `: ${existing.vendor}` : ""}`,
        });

        revalidatePath("/dashboard/expenses");
        return { success: true, message: "Receipt attached." };
    } catch (error) {
        console.error("Failed to attach receipt:", error);
        return { success: false, message: "Failed to attach receipt." };
    }
}
