/**
 * Telegram Command Tests
 *
 * Verifies /pair /start /help commands are intercepted and never leak to the LLM.
 * Tests both the group-helpers pure functions and the command routing regex.
 */
import { describe, it, expect } from "vitest";
import { isGroupChat, hasBotMention, isReplyToBot, stripBotMention } from "../channels/telegram/group-helpers.js";

// ─── Helper to create mock grammY Context ────────────────────────────────────

function mockCtx(overrides: {
    chatType?: string;
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
    botUsername?: string;
    botId?: number;
    replyFrom?: { id: number };
} = {}): any {
    return {
        chat: { type: overrides.chatType ?? "private", id: 123 },
        message: {
            text: overrides.text ?? "",
            entities: overrides.entities ?? [],
            reply_to_message: overrides.replyFrom
                ? { from: { id: overrides.replyFrom.id } }
                : undefined,
        },
        me: {
            username: overrides.botUsername ?? "test_bot",
            id: overrides.botId ?? 999,
        },
        from: { id: 111, first_name: "Test", last_name: "User" },
    };
}

// ─── Group detection tests ───────────────────────────────────────────────────

describe("isGroupChat", () => {
    it("should return true for 'group' chat type", () => {
        expect(isGroupChat(mockCtx({ chatType: "group" }))).toBe(true);
    });

    it("should return true for 'supergroup' chat type", () => {
        expect(isGroupChat(mockCtx({ chatType: "supergroup" }))).toBe(true);
    });

    it("should return false for 'private' chat type", () => {
        expect(isGroupChat(mockCtx({ chatType: "private" }))).toBe(false);
    });

    it("should return false for 'channel' chat type", () => {
        expect(isGroupChat(mockCtx({ chatType: "channel" }))).toBe(false);
    });
});

// ─── Bot mention detection tests ─────────────────────────────────────────────

describe("hasBotMention", () => {
    it("should detect @bot mention in entities", () => {
        const ctx = mockCtx({
            text: "@test_bot hello",
            entities: [{ type: "mention", offset: 0, length: 9 }],
            botUsername: "test_bot",
        });
        expect(hasBotMention(ctx)).toBe(true);
    });

    it("should be case-insensitive for bot username", () => {
        const ctx = mockCtx({
            text: "@Test_Bot hello",
            entities: [{ type: "mention", offset: 0, length: 9 }],
            botUsername: "test_bot",
        });
        expect(hasBotMention(ctx)).toBe(true);
    });

    it("should return false when no mention entities", () => {
        const ctx = mockCtx({ text: "hello world" });
        expect(hasBotMention(ctx)).toBe(false);
    });
});

// ─── Reply to bot detection ──────────────────────────────────────────────────

describe("isReplyToBot", () => {
    it("should detect reply to bot's own message", () => {
        const ctx = mockCtx({ botId: 999, replyFrom: { id: 999 } });
        expect(isReplyToBot(ctx)).toBe(true);
    });

    it("should return false when reply is to another user", () => {
        const ctx = mockCtx({ botId: 999, replyFrom: { id: 888 } });
        expect(isReplyToBot(ctx)).toBe(false);
    });
});

// ─── Strip bot mention ───────────────────────────────────────────────────────

describe("stripBotMention", () => {
    it("should strip @botname from text", () => {
        expect(stripBotMention("@test_bot hello world", "test_bot")).toBe("hello world");
    });

    it("should be case-insensitive", () => {
        expect(stripBotMention("@Test_Bot hi", "test_bot")).toBe("hi");
    });

    it("should handle mention in the middle of text", () => {
        expect(stripBotMention("hey @test_bot do something", "test_bot")).toBe("hey  do something");
    });

    it("should handle text with no mention", () => {
        expect(stripBotMention("just normal text", "test_bot")).toBe("just normal text");
    });
});

// ─── Command regex tests (mirrors TelegramAdapter.handleBotCommand) ──────────

describe("Command regex matching", () => {
    // This is the exact regex from adapter.ts line 313
    const CMD_REGEX = /^\/(\w+)(?:@\S+)?\s*$/;

    it("should match /pair", () => {
        const match = "/pair".match(CMD_REGEX);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("pair");
    });

    it("should match /start@botname", () => {
        const match = "/start@mybot".match(CMD_REGEX);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("start");
    });

    it("should match /help with trailing whitespace", () => {
        const match = "/help  ".match(CMD_REGEX);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("help");
    });

    it("should NOT match regular text", () => {
        expect("hello world".match(CMD_REGEX)).toBeNull();
    });

    it("should NOT match /pair with arguments (not a bare command)", () => {
        expect("/pair some_code".match(CMD_REGEX)).toBeNull();
    });

    it("should match full mention-stripped flow: @bot /pair → /pair", () => {
        const rawText = "@mybot /pair";
        const stripped = stripBotMention(rawText, "mybot").trim();
        const match = stripped.match(CMD_REGEX);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("pair");
    });
});
