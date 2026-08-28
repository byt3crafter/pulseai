/**
 * Minimal tar reader — enough to pull SKILL.md files out of a repo tarball.
 *
 * Written rather than depended on. The gateway image has neither `git` nor a
 * tar binary, and adding a dependency to unpack untrusted archives from public
 * repos is a worse trade than 60 lines of a format that has not changed since
 * 1979. We only ever read; nothing is written to disk.
 *
 * See docs/SKILLS_PLAN.md.
 */

const BLOCK = 512;

function str(buf: Buffer, offset: number, length: number): string {
    const end = buf.indexOf(0, offset);
    const stop = end === -1 || end > offset + length ? offset + length : end;
    return buf.toString("utf8", offset, stop).trim();
}

export interface TarEntry {
    path: string;
    content: Buffer;
}

/**
 * Read entries from an uncompressed tar buffer.
 *
 * `keep` decides what is materialised, so a 60MB repo does not become 60MB of
 * strings in memory when we want a few hundred small files out of it.
 */
export function readTar(buf: Buffer, keep: (path: string) => boolean): TarEntry[] {
    const out: TarEntry[] = [];
    let offset = 0;

    while (offset + BLOCK <= buf.length) {
        const header = buf.subarray(offset, offset + BLOCK);
        // Two consecutive zero blocks mark the end of the archive.
        if (header.every((b) => b === 0)) break;

        const name = str(header, 0, 100);
        const sizeField = str(header, 124, 12);
        const size = parseInt(sizeField, 8) || 0;
        const typeFlag = String.fromCharCode(header[156]);
        // GNU long names / PAX headers use a prefix field for the rest of the path.
        const prefix = str(header, 345, 155);
        const fullPath = prefix ? `${prefix}/${name}` : name;

        offset += BLOCK;

        // '0' and '\0' are regular files; everything else (dirs, links, PAX
        // metadata) is skipped rather than guessed at.
        if ((typeFlag === "0" || typeFlag === "\0") && keep(fullPath)) {
            out.push({ path: fullPath, content: buf.subarray(offset, offset + size) });
        }

        // Entries are padded to a block boundary.
        offset += Math.ceil(size / BLOCK) * BLOCK;
    }

    return out;
}
