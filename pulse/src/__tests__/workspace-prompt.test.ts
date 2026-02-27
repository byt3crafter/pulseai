/**
 * Workspace Prompt Tests
 *
 * Verifies that agent identity/soul loading works correctly so agents
 * don't introduce themselves as "AI Assistant" when configured with a name.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing
vi.mock("../../src/storage/db.js", () => ({
    db: {
        query: { workspaceRevisions: { findFirst: vi.fn() } },
        insert: vi.fn().mockReturnValue({ values: vi.fn() }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn() }) }) }),
    },
}));

vi.mock("../../src/config.js", () => ({
    config: {
        WORKSPACE_BASE_DIR: "/tmp/test-workspaces",
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock node:fs/promises to control file reads
const mockReadFile = vi.fn();
const mockAccess = vi.fn();
const mockReaddir = vi.fn();
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("node:fs/promises", () => ({
    readFile: (...args: any[]) => mockReadFile(...args),
    access: (...args: any[]) => mockAccess(...args),
    readdir: (...args: any[]) => mockReaddir(...args),
    mkdir: (...args: any[]) => mockMkdir(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
}));

import { WorkspaceService } from "../agent/workspace/workspace-service.js";

describe("Workspace Prompt Building", () => {
    let service: WorkspaceService;

    beforeEach(() => {
        service = new WorkspaceService();
        vi.clearAllMocks();
        mockReaddir.mockResolvedValue([]); // No knowledge files by default
    });

    it("should return null when no workspace files exist", async () => {
        mockAccess.mockRejectedValue(new Error("ENOENT"));
        mockReadFile.mockRejectedValue(new Error("ENOENT"));

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");
        expect(result).toBeNull();
    });

    it("should extract agent name from IDENTITY.md", async () => {
        const identity = `# Identity\n\n- **Name**: Sentinel Voss\n- **Role**: IT Director`;
        const soul = `# Soul\n\nYou are helpful.`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("IDENTITY.md")) return Promise.resolve(identity);
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        expect(result).toContain("Sentinel Voss");
        expect(result).toContain("IDENTITY OVERRIDE");
        expect(result).toContain("Your name is Sentinel Voss");
    });

    it("should extract name from SOUL.md when IDENTITY.md has default name", async () => {
        const identity = `# Identity\n\n- **Name**: AI Assistant\n- **Role**: Assistant`;
        const soul = `# Soul\n\nYou are Marcus Chen, a senior developer.`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("IDENTITY.md")) return Promise.resolve(identity);
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        expect(result).toContain("Marcus Chen");
        expect(result).toContain("Your name is Marcus Chen");
    });

    it("should include RESPONSE GUIDELINES block", async () => {
        const soul = `# Soul\n\nYou are helpful.`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        expect(result).toContain("RESPONSE GUIDELINES");
        expect(result).toContain("Be natural and conversational");
    });

    it("should include memory section when MEMORY.md exists", async () => {
        const soul = `# Soul\n\nYou are helpful.`;
        const memory = `- User prefers French greetings\n- Project deadline is March 2026`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            if (path.includes("MEMORY.md")) return Promise.resolve(memory);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        expect(result).toContain("Persistent Memory");
        expect(result).toContain("User prefers French greetings");
    });

    it("should compose all sections with separator", async () => {
        const identity = `# Identity\n\n- **Name**: TestBot\n- **Role**: Test`;
        const soul = `# Soul\n\nBe helpful.`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("IDENTITY.md")) return Promise.resolve(identity);
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        // Should have identity, identity override, soul, and response guidelines
        expect(result).toContain("# Identity");
        expect(result).toContain("IDENTITY OVERRIDE");
        expect(result).toContain("Be helpful.");
        expect(result).toContain("RESPONSE GUIDELINES");
        // Sections separated by ---
        expect(result!.split("---").length).toBeGreaterThanOrEqual(4);
    });

    it("should handle only SOUL.md existing (no identity)", async () => {
        const soul = `# Soul\n\nYou are Nova, an accounting assistant.`;

        mockAccess.mockResolvedValue(undefined);
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes("SOUL.md")) return Promise.resolve(soul);
            return Promise.reject(new Error("ENOENT"));
        });

        const result = await service.buildSystemPrompt("tenant-1", "agent-1");

        expect(result).not.toBeNull();
        expect(result).toContain("Nova");
        expect(result).toContain("Your name is Nova");
    });
});
