/**
 * PULSE PATCH: the one place the Pulse runtime is resolved.
 *
 * Inside Pulse there is exactly one backend. Not a default, not a preference —
 * the only one. This module is the single reader of the env that says where it
 * is, so the page, the settings store and the runtime proxy cannot disagree.
 *
 * Deliberately NOT read here: HERMES3D_GATEWAY_ADAPTER_TYPE. It used to let a
 * deployment ask for `hermes`, and its absent-value fallback was `"hermes"` —
 * which is how a Pulse deployment could boot pointing at a runtime that does
 * not exist. The adapter type is a constant now.
 *
 * Server-only: `process.env` is empty in the browser, and a component that
 * reads this must receive the result as a prop from a server component.
 */

export type PulseRuntime = {
  /** Where the Pulse gateway lives. */
  url: string;
  /** Always "custom" — the adapter that speaks to Pulse. */
  adapterType: "custom";
};

/**
 * Returns null only when no gateway is configured — the headless case, and a
 * bare `npm run dev` with no env. Everywhere else this is the whole answer.
 */
export function resolvePulseRuntime(): PulseRuntime | null {
  const url = process.env.HERMES3D_GATEWAY_URL?.trim();
  if (!url) return null;
  return { url, adapterType: "custom" };
}

/** The global the server stamps into the page. Read by `readPulseRuntime`. */
export const PULSE_RUNTIME_GLOBAL = "__PULSE_RUNTIME__";

/**
 * The browser-side half. Reads the runtime the server stamped into the HTML,
 * so it is available on the FIRST render — before any fetch, and regardless of
 * whether the network is working.
 *
 * That timing is the whole point. The office used to boot as a Hermes client
 * holding `ws://localhost:18789` and only became a Pulse client after
 * /api/studio answered. On a slow or failing link it never did, and the office
 * sat on "Connecting to your runtime..." with a HERMES badge forever, because
 * that fetch had no timeout, no retry, and fell back to Hermes rather than env.
 */
export function readPulseRuntime(): PulseRuntime | null {
  // On the server there is no window — read env directly, so the HTML React
  // renders is already Pulse. Without this the server paints the upstream
  // default and the client corrects it a moment later: a visible flash of
  // "HERMES • DISCONNECTED" and a hydration mismatch on every load.
  // In the browser bundle this branch is unreachable, and the env read is
  // compiled out.
  if (typeof window === "undefined") return resolvePulseRuntime();
  const raw = (window as unknown as Record<string, unknown>)[PULSE_RUNTIME_GLOBAL];
  if (!raw || typeof raw !== "object") return null;
  const url = (raw as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim()) return null;
  return { url: url.trim(), adapterType: "custom" };
}
