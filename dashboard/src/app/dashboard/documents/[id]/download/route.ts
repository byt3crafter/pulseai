import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../../../../../auth";
import { db } from "../../../../../storage/db";
import { documents } from "../../../../../storage/schema";
import { scopedTo } from "../../../../../utils/visibility";

/**
 * Tenant-scoped file download. Decodes the base64 `content` column back into
 * raw bytes and streams it with the original mime type / filename. The
 * tenantId comes from the session only — never from the URL — so a document
 * can only ever be downloaded by the tenant that owns it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session?.user || !tenantId) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        return new NextResponse("Not found", { status: 404 });
    }

    try {
        const [doc] = await db.select({
            filename: documents.filename,
            mimeType: documents.mimeType,
            content: documents.content,
        })
            .from(documents)
            .where(and(eq(documents.id, id), scopedTo(documents, tenantId, (session.user as any).id)))
            .limit(1);

        if (!doc || !doc.content) {
            return new NextResponse("Not found", { status: 404 });
        }

        const buf = Buffer.from(doc.content, "base64");
        const filename = (doc.filename || "download").replace(/"/g, "");

        return new NextResponse(buf, {
            status: 200,
            headers: {
                "Content-Type": doc.mimeType || "application/octet-stream",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": String(buf.length),
            },
        });
    } catch (error) {
        console.error("Failed to download document:", error);
        return new NextResponse("Not found", { status: 404 });
    }
}
