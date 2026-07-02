// Pulse desktop renderer — talks to the gateway App API (/api/app/*).
const DEFAULT_SERVER = "https://pulse.runstate.mu:8082";
const $ = (id) => document.getElementById(id);

const state = {
    server: localStorage.getItem("pulse.server") || DEFAULT_SERVER,
    token: localStorage.getItem("pulse.token") || "",
    user: JSON.parse(localStorage.getItem("pulse.user") || "null"),
    agents: [],
    activeAgentId: null,
};

$("ver").textContent = window.pulse ? "v" + window.pulse.version : "";

function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;
    return fetch(state.server.replace(/\/$/, "") + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
}

// ── Login ──
$("server").value = state.server;
$("advToggle").onclick = () => { $("adv").hidden = !$("adv").hidden; };

async function doLogin() {
    $("loginErr").hidden = true;
    state.server = ($("server").value.trim() || DEFAULT_SERVER);
    localStorage.setItem("pulse.server", state.server);
    const email = $("email").value.trim();
    const password = $("password").value;
    const totp = $("totp").value.trim();
    if (!email || !password) return showLoginErr("Enter your email and password.");

    $("signin").disabled = true; $("signin").textContent = "Signing in…";
    try {
        const res = await api("/api/app/login", { method: "POST", auth: false, body: { email, password, totp: totp || undefined } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (data.error === "2fa_required") { $("totpRow").hidden = false; $("totp").focus(); return showLoginErr("Enter your authentication code."); }
            return showLoginErr(data.error || "Sign in failed.");
        }
        state.token = data.token; state.user = data.user;
        localStorage.setItem("pulse.token", state.token);
        localStorage.setItem("pulse.user", JSON.stringify(state.user));
        enterApp();
    } catch (e) {
        showLoginErr("Can't reach the server. Check the gateway URL in Server settings.");
    } finally {
        $("signin").disabled = false; $("signin").textContent = "Sign in";
    }
}
function showLoginErr(m) { $("loginErr").textContent = m; $("loginErr").hidden = false; }
$("signin").onclick = doLogin;
["email", "password", "totp"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); }));

// ── App ──
async function enterApp() {
    $("login").hidden = true; $("app").hidden = false;
    $("userName").textContent = state.user?.name || state.user?.email || "You";
    await loadAgents();
    await loadHistory();
}

async function loadAgents() {
    try {
        const res = await api("/api/app/agents");
        if (res.status === 401) return logout();
        const { agents } = await res.json();
        state.agents = agents || [];
        state.activeAgentId = state.agents[0]?.id || null;
        renderAgents();
    } catch {}
}
function renderAgents() {
    const list = $("agentList"); list.innerHTML = "";
    if (!state.agents.length) { list.innerHTML = '<div style="color:var(--faint);font-size:13px;padding:8px">No agents yet</div>'; return; }
    state.agents.forEach((a) => {
        const b = document.createElement("button");
        b.className = "agent-item" + (a.id === state.activeAgentId ? " active" : "");
        b.textContent = a.name;
        b.onclick = () => { state.activeAgentId = a.id; $("activeAgent").textContent = a.name; renderAgents(); };
        list.appendChild(b);
    });
    const active = state.agents.find((a) => a.id === state.activeAgentId);
    if (active) $("activeAgent").textContent = active.name;
}

async function loadHistory() {
    try {
        const res = await api("/api/app/history");
        if (res.status === 401) return logout();
        const { messages } = await res.json();
        $("messages").innerHTML = "";
        (messages || []).forEach((m) => addMsg(m.role === "user" ? "user" : "assistant", m.content));
        scrollDown();
    } catch {}
}

function addMsg(role, content) {
    const d = document.createElement("div");
    d.className = "msg " + role;
    d.textContent = content;
    $("messages").appendChild(d);
    return d;
}
function scrollDown() { const m = $("messages"); m.scrollTop = m.scrollHeight; }

$("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("input").value.trim();
    if (!text) return;
    $("input").value = ""; $("input").style.height = "auto";
    addMsg("user", text); scrollDown();
    const typing = addMsg("assistant typing", "…"); scrollDown();
    $("send").disabled = true;
    try {
        const res = await api("/api/app/chat", { method: "POST", body: { content: text, agentProfileId: state.activeAgentId || undefined } });
        if (res.status === 401) return logout();
        const data = await res.json();
        typing.remove();
        addMsg("assistant", data.reply || data.error || "(no response)");
    } catch {
        typing.remove();
        addMsg("assistant", "Couldn't reach the server.");
    } finally {
        $("send").disabled = false; scrollDown();
    }
});
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; });
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); } });

function logout() {
    localStorage.removeItem("pulse.token"); localStorage.removeItem("pulse.user");
    state.token = ""; state.user = null;
    $("app").hidden = true; $("login").hidden = false;
}
$("logout").onclick = logout;

// Auto-enter if already signed in
if (state.token && state.user) enterApp();
