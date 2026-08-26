export const fetchJson = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> => {
  // PULSE PATCH: never wait forever.
  //
  // The office's whole first paint used to hang off one call through here with
  // no AbortSignal — so a request that never settled left the UI pinned on a
  // loading state with no timeout and no retry. A caller that passes its own
  // signal still wins.
  const res = await fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${res.status}.`;
    throw new Error(errorMessage);
  }
  return data as T;
};
