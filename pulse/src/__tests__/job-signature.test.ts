import { describe, it, expect } from "vitest";
import { __jobSignatureForTests as sig } from "../cron/scheduler.js";

const base = {
    scheduleType: "cron", cronExpression: "*/15 * * * *", intervalSeconds: null,
    runAt: null, timezone: "UTC", agentId: "a1", message: "check the inbox",
    precondition: null, tools: null,
};

/*
 * The scheduler captures a job object in a closure and only re-creates it when
 * this signature changes. A field missing here is a setting that saves fine and
 * then does nothing until the process restarts — silent, and indistinguishable
 * from the feature being broken.
 */
describe("job signature covers everything execution reads", () => {
    it("changes when the precondition changes", () => {
        expect(sig({ ...base, precondition: "email_unread" })).not.toBe(sig(base));
    });

    it("changes when the tool scope changes", () => {
        expect(sig({ ...base, tools: ["email_fetch_unread"] })).not.toBe(sig(base));
        expect(sig({ ...base, tools: ["a", "b"] })).not.toBe(sig({ ...base, tools: ["a"] }));
    });

    it("still changes on the scheduling fields it always covered", () => {
        expect(sig({ ...base, cronExpression: "0 * * * *" })).not.toBe(sig(base));
        expect(sig({ ...base, message: "something else" })).not.toBe(sig(base));
    });

    it("is stable when nothing changed", () => {
        expect(sig({ ...base })).toBe(sig({ ...base }));
    });
});
