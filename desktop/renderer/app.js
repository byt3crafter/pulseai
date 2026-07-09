// Pulse desktop renderer — talks to the gateway App API (/api/app/*).
// The gateway is fronted by HTTPS at /api/gateway on the main domain (valid
// cert + WebSocket). Port 8082 is plain HTTP and must NOT be used for login.
const DEFAULT_SERVER = "https://pulse.runstate.mu/api/gateway";
// Auto-migrate machines that saved a known-broken URL from an older build.
const LEGACY_SERVERS = [
    "https://pulse.runstate.mu:8082",
    "http://pulse.runstate.mu:8082",
    "https://pulse.runstate.mu",
    "https://pulse.runstate.mu/",
];
const $ = (id) => document.getElementById(id);

function resolveSavedServer() {
    const saved = localStorage.getItem("pulse.server");
    if (!saved || LEGACY_SERVERS.includes(saved.replace(/\/$/, "")) || LEGACY_SERVERS.includes(saved)) {
        localStorage.setItem("pulse.server", DEFAULT_SERVER);
        return DEFAULT_SERVER;
    }
    return saved;
}

const state = {
    server: resolveSavedServer(),
    token: localStorage.getItem("pulse.token") || "",
    user: JSON.parse(localStorage.getItem("pulse.user") || "null"),
    channels: [],
    agents: [],
    // active = { type: 'channel'|'agent', id, name, access, agents:[{agentProfileId,name}] }
    active: null,
};

$("ver").textContent = window.pulse ? "v" + window.pulse.version : "";

function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;
    return fetch(state.server.replace(/\/$/, "") + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
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
    } catch {
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
    await Promise.all([loadChannels(), loadAgents()]);
    renderSidebar();
    // Prefer a channel; fall back to a direct agent.
    if (state.channels.length) selectChannel(state.channels[0]);
    else if (state.agents.length) selectAgent(state.agents[0]);
    else emptyState();
}

async function loadChannels() {
    try {
        const res = await api("/api/app/channels");
        if (res.status === 401) return logout();
        const { channels } = await res.json();
        state.channels = channels || [];
    } catch { state.channels = []; }
}
async function loadAgents() {
    try {
        const res = await api("/api/app/agents");
        if (res.status === 401) return logout();
        const { agents } = await res.json();
        state.agents = agents || [];
    } catch { state.agents = []; }
}

function renderSidebar() {
    // Channels (departments, groups indented under them)
    const cl = $("channelList"); cl.innerHTML = "";
    const depts = state.channels.filter((c) => c.kind === "department");
    const groupsOf = (id) => state.channels.filter((c) => c.kind === "group" && c.parentId === id);
    depts.forEach((d) => {
        cl.appendChild(channelButton(d, false));
        groupsOf(d.id).forEach((g) => cl.appendChild(channelButton(g, true)));
    });
    // Orphan groups (parent not visible to this user)
    state.channels.filter((c) => c.kind === "group" && !depts.some((d) => d.id === c.parentId))
        .forEach((g) => cl.appendChild(channelButton(g, true)));
    $("channelSection").hidden = state.channels.length === 0;

    // Direct agents
    const al = $("agentList"); al.innerHTML = "";
    state.agents.forEach((a) => {
        const b = document.createElement("button");
        b.className = "agent-item" + (state.active?.type === "agent" && state.active.id === a.id ? " active" : "");
        b.textContent = a.name;
        b.onclick = () => selectAgent(a);
        al.appendChild(b);
    });
    $("agentSection").hidden = state.agents.length === 0;
}

function channelButton(c, indent) {
    const b = document.createElement("button");
    b.className = "agent-item" + (indent ? " indent" : "")
        + (state.active?.type === "channel" && state.active.id === c.id ? " active" : "");
    b.innerHTML = `<span class="ch-hash">${indent ? "•" : "#"}</span>${escapeHtml(c.name)}`
        + (c.access === "observe" ? `<span class="ro-tag">read-only</span>` : "");
    b.onclick = () => selectChannel(c);
    return b;
}

function emptyState() {
    $("activeAgent").textContent = "Nothing here yet";
    $("headSub").textContent = "";
    $("messages").innerHTML = '<div class="empty">You are not in any department yet, and no agents are available. Ask your operator to add you.</div>';
    setComposer(false);
}

// ── Selecting a channel ──
async function selectChannel(c) {
    state.active = { type: "channel", id: c.id, name: c.name, access: c.access, agents: [] };
    renderSidebar();
    $("activeAgent").textContent = (c.kind === "group" ? "• " : "# ") + c.name;
    $("headSub").textContent = "Loading…";
    $("messages").innerHTML = "";
    try {
        const res = await api(`/api/app/channels/${c.id}/history`);
        if (res.status === 401) return logout();
        const data = await res.json();
        state.active.agents = data.agents || [];
        state.active.access = data.access || c.access;
        $("headSub").textContent = (state.active.agents.map((a) => a.name).join(", ")) || "No agents";
        (data.messages || []).forEach((m) => {
            if (m.role === "user") addMsg("user", m.content);
            else addMsg("assistant", m.content, agentNameById(m.senderAgentId));
        });
        setComposer(state.active.access !== "observe");
        scrollDown();
    } catch {
        $("headSub").textContent = "";
        setComposer(false);
    }
}
function agentNameById(id) {
    return state.active?.agents?.find((a) => a.agentProfileId === id)?.name || null;
}

// ── Selecting a direct agent (legacy 1:1) ──
async function selectAgent(a) {
    state.active = { type: "agent", id: a.id, name: a.name, access: "talk", agents: [a] };
    renderSidebar();
    $("activeAgent").textContent = a.name;
    $("headSub").textContent = "Direct message";
    $("messages").innerHTML = "";
    try {
        const res = await api("/api/app/history");
        if (res.status === 401) return logout();
        const { messages } = await res.json();
        (messages || []).forEach((m) => addMsg(m.role === "user" ? "user" : "assistant", m.content));
        scrollDown();
    } catch {}
    setComposer(true);
}

function setComposer(canTalk) {
    $("composer").hidden = !canTalk;
    $("readonlyBar").hidden = canTalk;
}

// ── Messages ──
function addMsg(role, content, senderName) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    if (senderName && role === "assistant") {
        const label = document.createElement("div");
        label.className = "msg-sender";
        label.textContent = senderName;
        wrap.appendChild(label);
    }
    const body = document.createElement("div");
    body.textContent = content;
    wrap.appendChild(body);
    $("messages").appendChild(wrap);
    return wrap;
}
function scrollDown() { const m = $("messages"); m.scrollTop = m.scrollHeight; }

$("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("input").value.trim();
    if (!text || !state.active) return;
    $("input").value = ""; $("input").style.height = "auto";
    addMsg("user", text); scrollDown();
    const typing = addMsg("assistant typing", "…"); scrollDown();
    $("send").disabled = true;
    try {
        let res, data;
        if (state.active.type === "channel") {
            res = await api(`/api/app/channels/${state.active.id}/messages`, { method: "POST", body: { content: text } });
        } else {
            res = await api("/api/app/chat", { method: "POST", body: { content: text, agentProfileId: state.active.id } });
        }
        if (res.status === 401) return logout();
        data = await res.json();
        typing.remove();
        if (!res.ok) { addMsg("assistant", data.error || "Something went wrong."); }
        else addMsg("assistant", data.reply || "(no response)", state.active.type === "channel" ? data.agent?.name : null);
    } catch {
        typing.remove();
        addMsg("assistant", "Couldn't reach the server.");
    } finally {
        $("send").disabled = false; scrollDown();
    }
});
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; });
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); } });

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function logout() {
    localStorage.removeItem("pulse.token"); localStorage.removeItem("pulse.user");
    state.token = ""; state.user = null; state.active = null;
    $("app").hidden = true; $("login").hidden = false;
}
$("logout").onclick = logout;

// Auto-enter if already signed in
if (state.token && state.user) enterApp();
