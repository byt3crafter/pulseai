/**
 * Fetch a skill pack from a git host, without git.
 *
 * The gateway image has no git binary, and adding one to unpack untrusted
 * archives from public repos is a worse trade than reading the tarball
 * directly. Everything goes through the SSRF guard, because the URL is
 * operator-supplied and could otherwise be pointed at internal metadata
 * endpoints.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { safeFetch } from "../utils/ssrf.js";
import { readTar } from "./tar-reader.js";
import { importSkillFiles, type ImportReport, type SkillFile } from "./skill-importer.js";

const gunzipAsync = promisify(gunzip);

/*
 * Size limits, learned the hard way.
 *
 * Importing openclaw/openclaw — a whole platform repo, 105MB compressed —
 * took the gateway down. The old code buffered the entire archive, checked its
 * size only afterwards, then called gunzipSync, which decompresses ~600MB in
 * one synchronous call and blocks the event loop long enough for the health
 * check to fail and Docker to restart the container.
 *
 * A skills repository is small: the largest of the real ones is ~12MB. The cap
 * is generous against that and still nowhere near enough to hurt the gateway,
 * and it is enforced DURING the download so an oversized repo is abandoned
 * rather than downloaded and then rejected.
 */
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const MAX_SKILL_BYTES = 512 * 1024;

/**
 * Turn a repo URL into a codeload tarball URL.
 *
 * Only hosts whose archive URL we actually know. Guessing a scheme for an
 * arbitrary host would produce a confusing 404 rather than a clear message.
 */
export interface RepoTarget {
    url: string;
    /** Path within the repo to import from, when the URL named a subfolder. */
    subdir: string;
    ref: string;
}

/**
 * Interpret a repository URL, including the browse URLs people actually paste.
 *
 * `https://github.com/owner/repo/tree/main/finance` is what you get from
 * clicking a folder on GitHub, and it was previously reduced to owner/repo and
 * silently imported the ENTIRE repository. That is worse than failing: the pack
 * says "Finance and accounting operations" and quietly contains all 212 skills
 * from every department, so nobody has any reason to look.
 */
export function parseRepoUrl(repoUrl: string, fallbackRef = "main"): RepoTarget {
    const u = new URL(repoUrl.replace(/\.git$/, "").replace(/\/$/, ""));
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    const [owner, repo, kind, ...rest] = parts;
    if (!owner || !repo) throw new Error("Expected a repository URL like https://github.com/owner/repo");

    let ref = fallbackRef;
    let subdir = "";
    // /tree/<ref>/<path…> on GitHub, /-/tree/<ref>/<path…> on GitLab.
    if (kind === "tree" && rest.length > 0) {
        ref = rest[0];
        subdir = rest.slice(1).join("/");
    }
    return { url: `https://${u.hostname}/${owner}/${repo}`, subdir, ref };
}

export function tarballUrl(repoUrl: string, ref = "main"): string {
    const u = new URL(repoUrl.replace(/\.git$/, "").replace(/\/$/, ""));
    const [owner, repo] = u.pathname.replace(/^\//, "").split("/");
    if (!owner || !repo) throw new Error("Expected a repository URL like https://github.com/owner/repo");

    if (u.hostname === "github.com" || u.hostname === "www.github.com") {
        return `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${ref}`;
    }
    if (u.hostname === "gitlab.com") {
        return `https://gitlab.com/${owner}/${repo}/-/archive/${ref}/${repo}-${ref}.tar.gz`;
    }
    throw new Error(`Unsupported host '${u.hostname}'. GitHub and GitLab repositories are supported.`);
}

/**
 * Read a response body, giving up as soon as it exceeds `limit`.
 *
 * The point is to abandon a 105MB download early rather than complete it and
 * then object — the damage is in holding it, not in judging it.
 */
async function readCapped(res: Response, limit: number, repoUrl: string): Promise<Buffer> {
    const reader = res.body?.getReader();
    if (!reader) return Buffer.from(await res.arrayBuffer());

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel().catch(() => {});
            throw new Error(
                `That repository is larger than ${Math.round(limit / 1048576)}MB and looks like an application ` +
                    `rather than a collection of skills. Point the pack at a skills repository ` +
                    `(${repoUrl} is too big to import).`,
            );
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}

export async function fetchPack(repoUrl: string, ref = "main"): Promise<ImportReport> {
    // A browse URL naming a subfolder means "import that folder", not the repo.
    const target = parseRepoUrl(repoUrl, ref);
    const url = tarballUrl(target.url, target.ref);

    const res = await safeFetch(url, { redirect: "follow" });
    if (!res.ok) {
        throw new Error(
            res.status === 404
                ? `Not found — check the repository URL and that '${ref}' is the right branch.`
                : `Download failed (HTTP ${res.status}).`,
        );
    }

    const gz = await readCapped(res, MAX_ARCHIVE_BYTES, repoUrl);

    let tar: Buffer;
    try {
        // Async, so zlib runs on the threadpool instead of blocking the event
        // loop; maxOutputLength bounds memory even for a hostile archive.
        tar = (await gunzipAsync(gz, { maxOutputLength: MAX_UNPACKED_BYTES })) as Buffer;
    } catch (e) {
        const msg = (e as Error)?.message ?? "";
        if (/maxOutputLength|buffer/i.test(msg)) {
            throw new Error(
                "That repository unpacks to more than this importer will hold. " +
                    "Point it at a repository of skills rather than a whole application.",
            );
        }
        throw new Error("Downloaded file is not a valid gzip archive.");
    }

    // A git tarball wraps everything in one top-level directory; the subdir
    // filter applies to the path *inside* the repo, which is what the operator
    // pasted.
    const prefix = target.subdir ? `${target.subdir.replace(/\/$/, "")}/` : "";
    const entries = readTar(tar, (p) => {
        if (!p.endsWith("/SKILL.md") && p !== "SKILL.md") return false;
        if (!prefix) return true;
        const inRepo = p.split("/").slice(1).join("/");
        return inRepo.startsWith(prefix);
    });

    const files: SkillFile[] = entries.map((e) => {
        // Strip the single top-level directory a git tarball always adds, so
        // paths match what the repo actually looks like.
        const inRepo = e.path.split("/").slice(1).join("/") || e.path;
        const path = prefix && inRepo.startsWith(prefix) ? inRepo.slice(prefix.length) : inRepo;
        if (e.content.length > MAX_SKILL_BYTES) {
            return { path, source: null, error: "File is unreasonably large for a skill." };
        }
        return { path, source: e.content.toString("utf8") };
    });

    if (files.length === 0) {
        throw new Error(
            target.subdir
                ? `No SKILL.md files found under '${target.subdir}' in that repository.`
                : "No SKILL.md files found in that repository.",
        );
    }

    return importSkillFiles(files);
}
