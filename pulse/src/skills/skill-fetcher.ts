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

import { gunzipSync } from "node:zlib";
import { safeFetch } from "../utils/ssrf.js";
import { readTar } from "./tar-reader.js";
import { importSkillFiles, type ImportReport, type SkillFile } from "./skill-importer.js";

/** Refuse anything implausible for a skills repo before decompressing it. */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_SKILL_BYTES = 512 * 1024;

/**
 * Turn a repo URL into a codeload tarball URL.
 *
 * Only hosts whose archive URL we actually know. Guessing a scheme for an
 * arbitrary host would produce a confusing 404 rather than a clear message.
 */
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

export async function fetchPack(repoUrl: string, ref = "main"): Promise<ImportReport> {
    const url = tarballUrl(repoUrl, ref);

    const res = await safeFetch(url, { redirect: "follow" });
    if (!res.ok) {
        throw new Error(
            res.status === 404
                ? `Not found — check the repository URL and that '${ref}' is the right branch.`
                : `Download failed (HTTP ${res.status}).`,
        );
    }

    const gz = Buffer.from(await res.arrayBuffer());
    if (gz.length > MAX_ARCHIVE_BYTES) throw new Error("Archive is too large to import.");

    let tar: Buffer;
    try {
        tar = gunzipSync(gz);
    } catch {
        throw new Error("Downloaded file is not a valid gzip archive.");
    }

    const entries = readTar(tar, (p) => p.endsWith("/SKILL.md") || p === "SKILL.md");

    const files: SkillFile[] = entries.map((e) => {
        // Strip the single top-level directory a git tarball always adds, so
        // paths match what the repo actually looks like.
        const path = e.path.split("/").slice(1).join("/") || e.path;
        if (e.content.length > MAX_SKILL_BYTES) {
            return { path, source: null, error: "File is unreasonably large for a skill." };
        }
        return { path, source: e.content.toString("utf8") };
    });

    if (files.length === 0) {
        throw new Error("No SKILL.md files found in that repository.");
    }

    return importSkillFiles(files);
}
