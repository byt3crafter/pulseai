import { describe, it, expect } from "vitest";
import { detectObfuscation } from "../../src/agent/tools/safety/obfuscation-detect.js";

describe("detectObfuscation", () => {
    // Base64 pipe to shell
    it("detects base64 -d piped to sh", () => {
        const result = detectObfuscation("echo 'dGVzdA==' | base64 -d | sh");
        expect(result.detected).toBe(true);
        expect(result.patterns).toContain("base64_pipe_shell");
    });

    it("detects base64 --decode piped to bash", () => {
        const result = detectObfuscation("cat encoded.txt | base64 --decode | bash");
        expect(result.detected).toBe(true);
    });

    // Hex decode
    it("detects xxd -r piped to shell", () => {
        const result = detectObfuscation("echo '7368' | xxd -r | sh");
        expect(result.detected).toBe(true);
        expect(result.patterns).toContain("hex_pipe_shell");
    });

    // eval with encoded input
    it("detects eval with base64 substitution", () => {
        const result = detectObfuscation("eval $(echo 'dGVzdA==' | base64 -d)");
        expect(result.detected).toBe(true);
    });

    // eval with variable
    it("detects eval with variable expansion", () => {
        const result = detectObfuscation('eval "$CMD"');
        expect(result.detected).toBe(true);
        expect(result.patterns).toContain("eval_variable");
    });

    // Process substitution
    it("detects process substitution with base64", () => {
        const result = detectObfuscation("bash <(base64 -d encoded.txt)");
        expect(result.detected).toBe(true);
    });

    // Python inline decode
    it("detects python -e with decode", () => {
        const result = detectObfuscation("python -e 'import base64; exec(base64.b64decode(\"...\").decode())'");
        expect(result.detected).toBe(true);
    });

    // Python exec decode
    it("detects python -c exec decode", () => {
        const result = detectObfuscation("python3 -c 'exec(b\"test\".decode())'");
        expect(result.detected).toBe(true);
    });

    // printf escape to shell
    it("detects printf octal escapes piped to sh", () => {
        const result = detectObfuscation("printf '\\150\\145\\154' | sh");
        expect(result.detected).toBe(true);
    });

    // OpenSSL decode
    it("detects openssl enc -d piped to bash", () => {
        const result = detectObfuscation("openssl enc -d -aes-256 -in payload | bash");
        expect(result.detected).toBe(true);
    });

    // Nested command substitution
    it("detects nested command substitution", () => {
        const result = detectObfuscation("$($( inner ))");
        expect(result.detected).toBe(true);
        expect(result.patterns).toContain("nested_cmd_sub");
    });

    // gzip decode
    it("detects gunzip piped to sh", () => {
        const result = detectObfuscation("gunzip -c payload.gz | sh");
        expect(result.detected).toBe(true);
    });

    // Safe commands should NOT trigger
    it("does NOT flag simple ls", () => {
        expect(detectObfuscation("ls -la").detected).toBe(false);
    });

    it("does NOT flag simple base64 encode", () => {
        expect(detectObfuscation("echo 'hello' | base64").detected).toBe(false);
    });

    it("does NOT flag simple python script", () => {
        expect(detectObfuscation("python3 script.py").detected).toBe(false);
    });

    it("does NOT flag echo with pipe to grep", () => {
        expect(detectObfuscation("echo 'test' | grep test").detected).toBe(false);
    });

    it("does NOT flag curl to file", () => {
        expect(detectObfuscation("curl -o output.json https://api.example.com/data").detected).toBe(false);
    });
});
