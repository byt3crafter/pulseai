A Custom Tool connects one endpoint of your own API to an agent — no code. You describe the request once (method, URL, parameters, headers), and the agent fills in the blanks and calls it whenever the conversation calls for it.

Custom Tools live at **Tools & Infrastructure → Custom Tools**. Under the hood, each one is a row in `custom_tools` that the runtime turns into a real tool at request time — the LLM sees the name, description and parameter schema you defined, and "calling the tool" means Pulse makes the HTTP request on the agent's behalf.

## Creating a tool

| Field | What it does |
|---|---|
| **Tool name** | The identifier the model calls, e.g. `get_order_status`. Letters, numbers and underscores only — anything else is stripped and collapsed automatically. Must be unique per workspace. |
| **Method** | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| **Description** | What the tool does and when to use it. This is the *only* thing the model reads to decide whether to call the tool — be specific. |
| **URL** | The endpoint, with `{param}` placeholders for anything variable, e.g. `https://api.yourcompany.com/orders/{orderId}`. Must start with `http://` or `https://`. |
| **Parameters** | The arguments the model can (or must) supply — name, type (`string` / `number` / `boolean`), description, and whether it's required. |
| **Headers & authentication** | Static headers sent with every call — this is where an API key or bearer token goes. Values are encrypted at rest and never shown again in plaintext. |
| **Agent access** | Which agents may call this tool. Leave empty to make it available to every agent in the workspace. |
| **Body template** *(Advanced)* | For `POST`/`PUT`/`PATCH`. Supports `{param}` placeholders. Leave blank and unused parameters are sent as a JSON body automatically. |
| **Timeout** *(Advanced)* | 1,000–30,000 ms. Default 15,000. |

## How a call is executed

1. Any `{param}` in the **URL** is substituted (URL-encoded) from the arguments the model passed.
2. Any parameters *not* consumed by the URL are attached automatically:
   - **GET / DELETE** — appended as query-string parameters.
   - **POST / PUT / PATCH** — sent as a JSON body (or substituted into your **Body template** if you set one). `Content-Type: application/json` is added if you didn't set one yourself.
3. Your saved headers are decrypted and attached.
4. The request runs with the tool's timeout, capped at 30 seconds regardless of what you configured.
5. The response comes back to the agent as `HTTP <status> <statusText>` followed by the response body, truncated at 20,000 characters.

If the request fails or times out, the agent gets a plain-text error instead of a crash — it can decide how to explain that to the user.

## Security guardrails

> Requests are blocked before they leave Pulse if the resolved URL points at localhost, a private/link-local IP range (`10.x`, `192.168.x`, `172.16–31.x`, `169.254.x`), `169.254.169.254` / `metadata.google.internal` (cloud metadata endpoints), or anything ending in `.internal`/`.localhost`. Only `http://` and `https://` are accepted. This is an SSRF guard — it stops a tool definition (accidentally or maliciously) from being used to reach infrastructure the agent shouldn't touch.

This check runs on every call, using the URL *after* your `{param}` substitution — so a parameter can't be used to smuggle a request past it either.

## Agent scope

`allowedAgentIds` on the tool is empty by default, which means **every agent in the workspace can call it**. Pick specific agents in the **Agent access** section to restrict it — useful when a tool talks to a system only one team's agent should touch.

## Good to know

- Tool names are case-folded and normalized (`Get Order!` → `get_order`) — check the generated name if it looks different from what you typed.
- There's no per-tool audit log of calls made — if you need to see what an agent actually sent, add logging on your own API endpoint.
- For read-only diagnostics against your own infrastructure (not a generic API), see [Servers (SSH)](/docs/tools/servers) instead — it's a different, more locked-down tool built for that.
- To gate a specific agent's use of a tool behind human approval, see [Tool Policy](/docs/agents/tool-policy).
