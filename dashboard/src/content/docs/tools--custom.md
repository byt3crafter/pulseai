A Custom Tool connects one endpoint of your own API to an agent — no code required. You describe the request once (method, URL, parameters, headers), and the agent fills in the details and calls it whenever the conversation calls for it.

Custom Tools live at **Tools & Infrastructure → Custom Tools**.

## Creating a tool

| Field | What it does |
|---|---|
| **Tool name** | The identifier the agent calls, e.g. `get_order_status`. Letters, numbers and underscores only — anything else is stripped and collapsed automatically. Must be unique in your workspace. |
| **Method** | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| **Description** | What the tool does and when to use it. This is the *only* thing the agent reads to decide whether to call the tool — be specific. |
| **URL** | The endpoint, with `{param}` placeholders for anything variable, e.g. `https://api.yourcompany.com/orders/{orderId}`. Must start with `http://` or `https://`. |
| **Parameters** | The arguments the agent can (or must) supply — name, type (`string` / `number` / `boolean`), description, and whether it's required. |
| **Headers & authentication** | Static headers sent with every call — this is where an API key or bearer token goes. Values are encrypted at rest and never shown again in plaintext once saved. |
| **Agent access** | Which agents may call this tool. Leave empty to make it available to every agent in your workspace. |
| **Body template** *(Advanced)* | For `POST`/`PUT`/`PATCH`. Supports `{param}` placeholders. Leave blank and any parameters not used in the URL are sent as a JSON body automatically. |
| **Timeout** *(Advanced)* | 1,000–30,000 ms. Default 15,000. |

## How a call is executed

1. Any `{param}` in the **URL** is filled in from the values the agent provides.
2. Any parameters *not* used in the URL are attached automatically:
   - **GET / DELETE** — appended as query-string parameters.
   - **POST / PUT / PATCH** — sent as a JSON body (or placed into your **Body template**, if you set one). `Content-Type: application/json` is added if you didn't set one yourself.
3. Your saved headers are attached to the request.
4. The request runs with the tool's timeout, capped at 30 seconds no matter what you configured.
5. The response comes back to the agent as the HTTP status followed by the response body, truncated at 20,000 characters.

If the request fails or times out, the agent receives a plain error message instead of crashing — it can decide how to explain that to whoever it's talking to.

## Keeping requests safe

> Pulse blocks a request before it leaves your workspace if it would reach localhost, a private/internal network address, or a cloud metadata address — even if that address only appears after your `{param}` values are filled in. This stops a tool definition, whether by accident or by a crafted input, from being used to reach infrastructure it was never meant to touch. Only `http://` and `https://` URLs are accepted at all.

## Agent access

By default, a new Custom Tool has no **Agent access** restriction, which means every agent in your workspace can call it. Pick specific agents in the **Agent access** section to limit it to them — useful when a tool talks to a system only one team's agent should touch.

## Good to know

- Tool names are cleaned up automatically (`Get Order #1` becomes `get_order_1`) — check the generated name if it looks different from what you typed.
- There's no built-in log of every call a tool makes. If you need a record of what was sent, add logging on your own API endpoint.
- For read-only checks against your own servers — not a general-purpose API — use [Servers (SSH)](/dashboard/docs/tools/servers) instead. It's a different, more locked-down tool built for that.
- To require a person's sign-off before an agent can use a specific tool, see [Tool Policy](/dashboard/docs/agents/tool-policy).
