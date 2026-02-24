# Pulse Agent CLI Spec

The **Pulse Agent CLI** (`@runstate/pulse-agent`) is a lightweight local utility that enables two-way communication between local development environments and the managed Pulse Cloud Gateway. 

Because of the architectural decision to remove host-machine commands from the cloud agent runtime for security, the CLI agent securely tunnels local commands to the isolated Cloud Agent using WebSocket.

## 1. Authentication
The CLI will utilize the OAuth 2.0 authorization code flow exposed by the Pulse Gateway (`/oauth/authorize` and `/oauth/token`). 

```bash
npx pulse-agent login
```

- **Flow**:
  1. Opens browser: `http://dashboard.pulse.example/oauth/authorize?client_id=pulse-local-cli`
  2. User approves connection for their specific tenant.
  3. CLI receives the Authorization Code via localhost callback server.
  4. CLI exchanges code for an Access Token at `http://api.pulse.example/oauth/token`.
  5. The Access Token is stored locally in `~/.pulse/config.json`.

## 2. CLI Tooling Standard
Customers can optionally use industry-standard CLI tools like **Claude Code** without using `pulse-agent` by configuring their base API URLs to point to Pulse:

```bash
export ANTHROPIC_BASE_URL="http://api.pulse.example/v1"
claude code --login
```
*(Pulse handles the OAuth loop to confirm tenant balance before passing requests to standard Anthropic APIs).*

## 3. Pulse Agent WebSocket Bridge
If the customer uses the custom `pulse-agent`, they can expose their local machine to the intelligence of their Cloud Agent safely.

```bash
npx pulse-agent link --dir ./my-project
```

- Connects to `wss://api.pulse.example/ws/agent?token=PLS_XXXX`
- The Cloud LLM encounters a "Tool Call" named `read_local_file`.
- The Gateway sends the tool call JSON down the WebSocket.
- The Local CLI validates the path is within `./my-project`, reads the file, and sends the contents back up the WebSocket to the LLM context flow.

## 4. Dependencies
- `ws` for WebSocket client connectivity.
- `open` for OAuth Browser launches.
- `zod` for payload validation.
- `chalk` for terminal UI.
