import { describe, it, expect } from "vitest";
import { extractBinary, checkSafeCommand, SAFE_BINARIES } from "../../src/agent/tools/safety/safe-commands.js";

describe("extractBinary", () => {
    it("extracts simple binary name", () => {
        expect(extractBinary("ls -la")).toBe("ls");
    });

    it("extracts binary from absolute path", () => {
        expect(extractBinary("/usr/bin/python3 script.py")).toBe("python3");
    });

    it("extracts binary with env prefix", () => {
        expect(extractBinary("env VAR=val python3 script.py")).toBe("python3");
    });

    it("handles multiple env vars", () => {
        expect(extractBinary("env FOO=1 BAR=2 node index.js")).toBe("node");
    });

    it("returns null for empty string", () => {
        expect(extractBinary("")).toBeNull();
    });

    it("returns null for whitespace-only", () => {
        expect(extractBinary("   ")).toBeNull();
    });
});

describe("checkSafeCommand", () => {
    it("recognizes ls as safe", () => {
        const result = checkSafeCommand("ls -la /tmp");
        expect(result).not.toBeNull();
        expect(result!.binary).toBe("ls");
    });

    it("recognizes python3 as safe", () => {
        const result = checkSafeCommand("python3 script.py");
        expect(result).not.toBeNull();
        expect(result!.binary).toBe("python3");
    });

    it("recognizes curl as safe", () => {
        const result = checkSafeCommand("curl https://api.example.com");
        expect(result).not.toBeNull();
        expect(result!.binary).toBe("curl");
    });

    it("recognizes jq as safe", () => {
        const result = checkSafeCommand("jq '.data' file.json");
        expect(result).not.toBeNull();
        expect(result!.binary).toBe("jq");
    });

    it("blocks find with -exec (denied flag)", () => {
        const result = checkSafeCommand("find . -name '*.log' -exec rm {} ;");
        expect(result).toBeNull();
    });

    it("blocks find with -delete (denied flag)", () => {
        const result = checkSafeCommand("find . -name '*.tmp' -delete");
        expect(result).toBeNull();
    });

    it("allows find without denied flags", () => {
        const result = checkSafeCommand("find . -name '*.ts' -type f");
        expect(result).not.toBeNull();
    });

    it("returns null for unknown binary", () => {
        expect(checkSafeCommand("malicious_binary --payload")).toBeNull();
    });

    it("returns null for rm (not in safe list)", () => {
        expect(checkSafeCommand("rm file.txt")).toBeNull();
    });

    it("returns null for chmod (not in safe list)", () => {
        expect(checkSafeCommand("chmod 755 script.sh")).toBeNull();
    });
});

describe("SAFE_BINARIES", () => {
    it("contains expected read-only tools", () => {
        expect(SAFE_BINARIES).toHaveProperty("ls");
        expect(SAFE_BINARIES).toHaveProperty("cat");
        expect(SAFE_BINARIES).toHaveProperty("grep");
        expect(SAFE_BINARIES).toHaveProperty("head");
        expect(SAFE_BINARIES).toHaveProperty("tail");
    });

    it("contains expected programming tools", () => {
        expect(SAFE_BINARIES).toHaveProperty("python3");
        expect(SAFE_BINARIES).toHaveProperty("node");
        expect(SAFE_BINARIES).toHaveProperty("npm");
    });

    it("contains expected network tools", () => {
        expect(SAFE_BINARIES).toHaveProperty("curl");
        expect(SAFE_BINARIES).toHaveProperty("wget");
        expect(SAFE_BINARIES).toHaveProperty("ping");
    });

    it("does NOT contain dangerous binaries", () => {
        expect(SAFE_BINARIES).not.toHaveProperty("rm");
        expect(SAFE_BINARIES).not.toHaveProperty("chmod");
        expect(SAFE_BINARIES).not.toHaveProperty("chown");
        expect(SAFE_BINARIES).not.toHaveProperty("kill");
        expect(SAFE_BINARIES).not.toHaveProperty("dd");
        expect(SAFE_BINARIES).not.toHaveProperty("mkfs");
    });
});
