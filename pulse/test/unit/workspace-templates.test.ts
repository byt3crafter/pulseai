import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const TEMPLATES_DIR = resolve(process.cwd(), "src/agent/workspace/templates");

const EXPECTED_TEMPLATES = [
    "ERPNEXT_API.md",
    "QUICKBOOKS_API.md",
    "PASTEL_API.md",
    "XERO_API.md",
    "PYTHON_PATTERNS.md",
    "REST_API_GENERAL.md",
];

describe("API Knowledge Templates", () => {
    for (const template of EXPECTED_TEMPLATES) {
        it(`${template} exists`, () => {
            const path = resolve(TEMPLATES_DIR, template);
            expect(existsSync(path)).toBe(true);
        });

        it(`${template} is not empty`, () => {
            const path = resolve(TEMPLATES_DIR, template);
            const content = readFileSync(path, "utf-8");
            expect(content.length).toBeGreaterThan(100);
        });

        it(`${template} has a title heading`, () => {
            const path = resolve(TEMPLATES_DIR, template);
            const content = readFileSync(path, "utf-8");
            expect(content).toMatch(/^#\s+.+/m);
        });
    }

    describe("ERPNEXT_API.md", () => {
        it("contains authentication section", () => {
            const content = readFileSync(resolve(TEMPLATES_DIR, "ERPNEXT_API.md"), "utf-8");
            expect(content).toContain("Authentication");
        });

        it("contains endpoint patterns", () => {
            const content = readFileSync(resolve(TEMPLATES_DIR, "ERPNEXT_API.md"), "utf-8");
            expect(content).toContain("/api/resource/");
        });

        it("contains Python pattern", () => {
            const content = readFileSync(resolve(TEMPLATES_DIR, "ERPNEXT_API.md"), "utf-8");
            expect(content).toContain("import requests");
        });
    });

    describe("PYTHON_PATTERNS.md", () => {
        it("contains requests library usage", () => {
            const content = readFileSync(resolve(TEMPLATES_DIR, "PYTHON_PATTERNS.md"), "utf-8");
            expect(content).toContain("requests");
        });

        it("contains error handling pattern", () => {
            const content = readFileSync(resolve(TEMPLATES_DIR, "PYTHON_PATTERNS.md"), "utf-8");
            expect(content.toLowerCase()).toContain("error");
        });
    });
});
