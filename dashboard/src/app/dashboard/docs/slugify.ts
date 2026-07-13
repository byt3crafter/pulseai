/**
 * Heading -> anchor id. Shared by the server page (which builds the "On this
 * page" rail from the raw markdown) and the client renderer (which stamps the
 * matching id onto each heading) — so it must NOT live in a "use client" file.
 */
export function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
}
