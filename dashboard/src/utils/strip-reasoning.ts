// Reasoning models (e.g. MiniMax M2.5) emit <think>…</think> chain-of-thought.
// Strip it so it never leaks into a stored SOUL / persona file. Handles the
// case where the model hits its token cap and emits an UNCLOSED <think> (no
// closing tag, no answer) — everything from the dangling opener onward is
// dropped. Safe to run on any persona-file content before persisting.
export function stripReasoning(s: string): string {
    return (s || "")
        // 1. closed reasoning blocks
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
        // 2. an unclosed opener + everything after it (reasoning ran to the end)
        .replace(/<think(?:ing)?>[\s\S]*$/gi, "")
        // 3. any stray tags
        .replace(/<\/?think(?:ing)?>/gi, "")
        .trim();
}
