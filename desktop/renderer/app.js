// Pulse desktop renderer — the web assistant experience, native.
// Login + App API (/api/app/*) for auth/agents/sessions; live chat streams over
// the gateway WebSocket (/ws), same protocol as the web assistant.
const DEFAULT_SERVER = "https://pulse.runstate.mu/api/gateway";
const LEGACY_SERVERS = [
    "https://pulse.runstate.mu:8082", "http://pulse.runstate.mu:8082",
    "https://pulse.runstate.mu", "https://pulse.runstate.mu/",
];
const $ = (id) => document.getElementById(id);

function resolveSavedServer() {
    const saved = localStorage.getItem("pulse.server");
    if (!saved || LEGACY_SERVERS.includes((saved || "").replace(/\/$/, ""))) {
        localStorage.setItem("pulse.server", DEFAULT_SERVER);
        return DEFAULT_SERVER;
    }
    return saved;
}

const state = {
    server: resolveSavedServer(),
    token: localStorage.getItem("pulse.token") || "",
    user: JSON.parse(localStorage.getItem("pulse.user") || "null"),
    agents: [],
    agentId: "",
    sessionId: "",
    ws: null,
    chatToken: "",
    conn: "offline",
    busy: false,
    pendingFiles: [],   // {id,name,mime,dataBase64,preview}
    reconnectTimer: null,
};

$("ver").textContent = window.pulse ? "v" + window.pulse.version : "";

function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;
    return fetch(state.server.replace(/\/$/, "") + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// ── Login (unchanged behaviour) ──
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
        if (res.redirected) { $("adv").hidden = false; return showLoginErr("Wrong Gateway URL — it must end in /api/gateway."); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (data.error === "2fa_required") { $("totpRow").hidden = false; $("totp").focus(); return showLoginErr("Enter your authentication code."); }
            return showLoginErr(data.error || "Sign in failed.");
        }
        if (!data.token) { $("adv").hidden = false; return showLoginErr("Unexpected response — check the Gateway URL."); }
        state.token = data.token; state.user = data.user;
        localStorage.setItem("pulse.token", state.token);
        localStorage.setItem("pulse.user", JSON.stringify(state.user));
        enterApp();
    } catch { showLoginErr("Can't reach the server. Check the gateway URL."); }
    finally { $("signin").disabled = false; $("signin").textContent = "Sign in"; }
}
function showLoginErr(m) { $("loginErr").textContent = m; $("loginErr").hidden = false; }
$("signin").onclick = doLogin;
["email", "password", "totp"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); }));

function logout() {
    try { state.ws && state.ws.close(); } catch {}
    localStorage.removeItem("pulse.token"); localStorage.removeItem("pulse.user");
    Object.assign(state, { token: "", user: null, agents: [], agentId: "", sessionId: "", ws: null, chatToken: "" });
    $("app").hidden = true; $("login").hidden = false;
}
$("logout").onclick = logout;

// ── Enter the app ──
async function enterApp() {
    $("login").hidden = true; $("app").hidden = false;
    $("userName").textContent = state.user?.name || state.user?.email || "You";
    await loadAgents();
    if (!state.agents.length) { $("messages").innerHTML = '<div class="empty">No agents are available for your workspace yet.</div>'; return; }
    // Restore last agent if still present.
    const last = localStorage.getItem("pulse.agentId");
    state.agentId = state.agents.some((a) => a.id === last) ? last : state.agents[0].id;
    renderAgentSelect();
    await connectWs();
    await switchAgent(state.agentId, true);
}

async function loadAgents() {
    try {
        const res = await api("/api/app/agents");
        if (res.status === 401) return logout();
        const { agents } = await res.json();
        state.agents = agents || [];
    } catch { state.agents = []; }
}

function renderAgentSelect() {
    const sel = $("agentSelect");
    sel.innerHTML = "";
    state.agents.forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id; o.textContent = a.name;
        if (a.id === state.agentId) o.selected = true;
        sel.appendChild(o);
    });
    sel.onchange = () => switchAgent(sel.value);
}

// ── WebSocket ──
function wsUrl() {
    // server is like https://host/api/gateway → ws is wss://host/ws
    let origin;
    try { origin = new URL(state.server).origin; } catch { origin = "https://pulse.runstate.mu"; }
    const ws = origin.replace(/^http/, "ws");
    return `${ws}/ws?token=${encodeURIComponent(state.chatToken)}`;
}
function setConn(s) {
    state.conn = s;
    const dot = $("connDot");
    dot.className = "conn-dot " + s;
    dot.title = s === "online" ? "Connected" : s === "connecting" ? "Connecting…" : "Offline — reconnecting";
    $("send").disabled = s !== "online";
}
async function connectWs() {
    setConn("connecting");
    try {
        const res = await api("/api/app/chat-token", { method: "POST" });
        if (res.status === 401) return logout();
        const data = await res.json();
        if (!data.token) { setConn("offline"); return; }
        state.chatToken = data.token;
    } catch { setConn("offline"); scheduleReconnect(); return; }

    const ws = new WebSocket(wsUrl());
    state.ws = ws;
    ws.onopen = () => setConn("online");
    ws.onclose = () => { setConn("offline"); scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } handleWs(m); };
}
function scheduleReconnect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => connectWs(), 3000);
}
setInterval(() => { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: "ping" })); }, 25000);

function handleWs(m) {
    if (m.type === "agent.thinking") upsertStreaming({ thinking: m.content, agentProfileId: m.agentProfileId });
    else if (m.type === "agent.streaming") upsertStreaming({ content: m.content, agentProfileId: m.agentProfileId });
    else if (m.type === "agent.tool") applyToolStep(m);
    else if (m.type === "agent.message") finalizeMessage(m);
    else if (m.type === "error") { removeStreaming(); addMessage("assistant", "⚠️ " + (m.message || "Something went wrong.")); state.busy = false; }
}

// ── Agents / sessions ──
async function switchAgent(id, initial) {
    state.agentId = id;
    localStorage.setItem("pulse.agentId", id);
    renderAgentSelect();
    const sessions = await loadSessions(id);
    renderSessions(sessions);
    if (sessions.length) await openSession(sessions[0].sessionId);
    else newChat();
}
async function loadSessions(agentId) {
    try {
        const res = await api(`/api/app/assistant/sessions?agentId=${encodeURIComponent(agentId)}`);
        if (res.status === 401) { logout(); return []; }
        const { sessions } = await res.json();
        return sessions || [];
    } catch { return []; }
}
function renderSessions(sessions) {
    const list = $("sessionList"); list.innerHTML = "";
    sessions.forEach((s) => {
        const b = document.createElement("button");
        b.className = "session-item" + (s.sessionId === state.sessionId ? " active" : "");
        b.textContent = s.title || "New chat";
        b.title = s.preview || "";
        b.onclick = () => openSession(s.sessionId);
        list.appendChild(b);
    });
}
async function openSession(sessionId) {
    state.sessionId = sessionId;
    state.busy = false;
    $("messages").innerHTML = "";
    try {
        const res = await api(`/api/app/assistant/history?agentId=${encodeURIComponent(state.agentId)}&sessionId=${encodeURIComponent(sessionId)}`);
        if (res.status === 401) return logout();
        const { messages } = await res.json();
        (messages || []).forEach((h) => addMessage(h.role, h.content, { agentProfileId: h.agentProfileId }));
    } catch {}
    Array.from($("sessionList").children).forEach((c) => c.classList.toggle("active", false));
    scrollDown();
}
function newChat() {
    state.sessionId = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    state.busy = false;
    $("messages").innerHTML = "";
    Array.from($("sessionList").children).forEach((c) => c.classList.remove("active"));
}
$("newChat").onclick = newChat;

// ── Messages / rendering ──
function agentName(id) { return (state.agents.find((a) => a.id === id) || {}).name; }

function renderMarkdown(text) {
    try {
        const html = window.marked.parse(text || "", { breaks: true });
        return window.DOMPurify.sanitize(html);
    } catch { return escapeHtml(text || ""); }
}

// A ```chart ...``` block → a tiny inline SVG (pie or bar). Falls back to a code
// block if the JSON doesn't parse.
function renderCharts(container) {
    container.querySelectorAll("pre > code.language-chart").forEach((code) => {
        let spec; try { spec = JSON.parse(code.textContent); } catch { return; }
        const svg = chartSvg(spec);
        if (svg) { const wrap = document.createElement("div"); wrap.className = "chart"; wrap.innerHTML = svg; code.parentElement.replaceWith(wrap); }
    });
}
function chartSvg(spec) {
    const data = (spec.data || spec.series || []).map((d) => ({ label: d.label ?? d.name ?? "", value: Number(d.value ?? d.y ?? 0) }));
    if (!data.length) return null;
    const colors = ["#6470E6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899"];
    if ((spec.type || "").includes("pie") || (spec.type || "").includes("donut")) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        let a0 = -Math.PI / 2, paths = "";
        data.forEach((d, i) => {
            const a1 = a0 + (d.value / total) * Math.PI * 2;
            const x0 = 60 + 55 * Math.cos(a0), y0 = 60 + 55 * Math.sin(a0);
            const x1 = 60 + 55 * Math.cos(a1), y1 = 60 + 55 * Math.sin(a1);
            const large = a1 - a0 > Math.PI ? 1 : 0;
            paths += `<path d="M60 60 L${x0.toFixed(1)} ${y0.toFixed(1)} A55 55 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${colors[i % colors.length]}"/>`;
            a0 = a1;
        });
        const legend = data.map((d, i) => `<div class="lg"><span style="background:${colors[i % colors.length]}"></span>${escapeHtml(d.label)} — ${((d.value / total) * 100).toFixed(1)}%</div>`).join("");
        return `<div class="chart-row"><svg viewBox="0 0 120 120" width="140" height="140">${paths}</svg><div class="legend">${legend}</div></div>`;
    }
    // bar
    const max = Math.max(...data.map((d) => d.value)) || 1;
    const bars = data.map((d, i) => {
        const w = Math.round((d.value / max) * 100);
        return `<div class="bar"><span class="bl">${escapeHtml(d.label)}</span><span class="bt"><span style="width:${w}%;background:${colors[i % colors.length]}"></span></span><span class="bv">${d.value}</span></div>`;
    }).join("");
    return `<div class="bars">${bars}</div>`;
}

function addMessage(role, content, opts = {}) {
    const m = $("messages");
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    if (role === "user") {
        if (opts.files && opts.files.length) {
            const fr = document.createElement("div"); fr.className = "u-files";
            opts.files.forEach((f) => {
                if (f.preview) { const img = document.createElement("img"); img.src = f.preview; fr.appendChild(img); }
                else { const c = document.createElement("div"); c.className = "u-file"; c.textContent = "📄 " + f.name; fr.appendChild(c); }
            });
            wrap.appendChild(fr);
        }
        if (content) { const b = document.createElement("div"); b.className = "bubble"; b.textContent = content; wrap.appendChild(b); }
    } else {
        renderAssistantInto(wrap, { content, agentProfileId: opts.agentProfileId, model: opts.model, routeReason: opts.routeReason });
    }
    m.appendChild(wrap);
    scrollDown();
    return wrap;
}

function renderAssistantInto(wrap, m) {
    wrap.dataset.agent = m.agentProfileId || "";
    const showId = state.agents.length > 1;
    if (showId || m.routeReason) {
        const meta = document.createElement("div"); meta.className = "a-meta";
        if (showId) { const n = document.createElement("span"); n.className = "a-name"; n.textContent = agentName(m.agentProfileId) || "Assistant"; meta.appendChild(n); }
        if (m.model && m.routeReason) { const b = document.createElement("span"); b.className = "a-model"; b.title = m.routeReason; b.textContent = shortModel(m.model); meta.appendChild(b); }
        wrap.appendChild(meta);
    }
    if (m.steps) wrap.appendChild(m.steps);
    const body = document.createElement("div"); body.className = "a-body md";
    body.innerHTML = renderMarkdown(m.content || "");
    renderCharts(body);
    wrap.appendChild(body);
}

function shortModel(id) { return String(id || "").replace(/^.*\//, "").replace(/-\d{6,8}$/, ""); }

// The current streaming assistant bubble (created lazily).
function streamingEl() {
    const m = $("messages");
    let last = m.lastElementChild;
    if (last && last.classList.contains("assistant") && last.dataset.streaming === "1") return last;
    return null;
}
function upsertStreaming(patch) {
    let el = streamingEl();
    // A different agent (meeting) starts a new bubble.
    if (el && patch.agentProfileId && el.dataset.agent && el.dataset.agent !== patch.agentProfileId) el = null;
    if (!el) {
        el = document.createElement("div");
        el.className = "msg assistant"; el.dataset.streaming = "1"; el.dataset.agent = patch.agentProfileId || "";
        el.innerHTML = '<div class="a-meta"></div><div class="steps"></div><div class="a-body md"></div>';
        $("messages").appendChild(el);
        state.busy = true;
    }
    if (patch.agentProfileId) el.dataset.agent = patch.agentProfileId;
    // meta (name)
    const showId = state.agents.length > 1;
    if (showId) { el.querySelector(".a-meta").innerHTML = `<span class="a-name">${escapeHtml(agentName(el.dataset.agent) || "Assistant")}</span>`; }
    if (patch.content != null) { const b = el.querySelector(".a-body"); b.dataset.raw = patch.content; b.innerHTML = renderMarkdown(patch.content); renderCharts(b); }
    if (patch.thinking != null) el.dataset.thinking = "1";
    scrollDown();
    return el;
}
function applyToolStep(step) {
    let el = streamingEl();
    if (el && step.agentProfileId && el.dataset.agent && el.dataset.agent !== step.agentProfileId) el = null;
    if (!el) el = upsertStreaming({ agentProfileId: step.agentProfileId });
    const steps = el.querySelector(".steps");
    if (step.phase === "start") {
        const row = document.createElement("div"); row.className = "step running"; row.dataset.name = step.name;
        row.innerHTML = `<span class="spin"></span>${escapeHtml(step.label || step.name)}${step.detail ? ` — ${escapeHtml(step.detail)}` : ""}`;
        steps.appendChild(row);
    } else {
        const rows = steps.querySelectorAll(`.step.running[data-name="${cssEsc(step.name)}"]`);
        const row = rows[rows.length - 1];
        if (row) { row.className = "step " + (step.phase === "error" ? "err" : "done"); row.innerHTML = `<span class="tick">${step.phase === "error" ? "✕" : "✓"}</span>${escapeHtml(step.label || step.name)}${step.detail ? ` — ${escapeHtml(step.detail)}` : ""}`; }
    }
    scrollDown();
}
function finalizeMessage(m) {
    let el = streamingEl();
    if (el && m.agentProfileId && el.dataset.agent && el.dataset.agent !== m.agentProfileId) el = null;
    if (!el) { addMessage("assistant", m.content, { agentProfileId: m.agentProfileId, model: m.model, routeReason: m.routeReason }); state.busy = false; refreshSessionsSoon(); return; }
    el.dataset.streaming = "0";
    el.dataset.agent = m.agentProfileId || el.dataset.agent || "";
    // Rebuild cleanly with meta + steps preserved + final markdown.
    const steps = el.querySelector(".steps");
    const stepClone = steps && steps.children.length ? steps.cloneNode(true) : null;
    el.innerHTML = "";
    renderAssistantInto(el, { content: m.content, agentProfileId: el.dataset.agent, model: m.model, routeReason: m.routeReason, steps: stepClone });
    state.busy = false;
    scrollDown();
    refreshSessionsSoon();
}
function removeStreaming() { const el = streamingEl(); if (el) el.remove(); }

let refreshTimer = null;
function refreshSessionsSoon() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => { renderSessions(await loadSessions(state.agentId)); }, 800);
}
function scrollDown() { const m = $("messages"); m.scrollTop = m.scrollHeight; }

// ── Composer ──
const MAX_FILE_BYTES = 20 * 1024 * 1024;
function fileToBase64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(",") + 1)); }; r.onerror = () => rej(); r.readAsDataURL(f); }); }
async function addFiles(files) {
    for (const f of Array.from(files)) {
        if (f.size > MAX_FILE_BYTES) continue;
        try {
            const dataBase64 = await fileToBase64(f);
            const preview = f.type.startsWith("image/") ? `data:${f.type};base64,${dataBase64}` : "";
            state.pendingFiles.push({ id: "f" + Math.random().toString(36).slice(2), name: f.name, mime: f.type, dataBase64, preview });
        } catch {}
    }
    renderChips();
}
function renderChips() {
    const c = $("fileChips"); c.innerHTML = "";
    state.pendingFiles.forEach((f) => {
        const chip = document.createElement("div"); chip.className = "chip";
        chip.innerHTML = (f.preview ? `<img src="${f.preview}">` : `<span class="fi">📄</span>`) + `<span class="fn">${escapeHtml(f.name)}</span><button class="x" title="Remove">×</button>`;
        chip.querySelector(".x").onclick = () => { state.pendingFiles = state.pendingFiles.filter((x) => x.id !== f.id); renderChips(); };
        c.appendChild(chip);
    });
    c.hidden = state.pendingFiles.length === 0;
}
$("attach").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; };

const composer = $("composer");
composer.addEventListener("dragover", (e) => { e.preventDefault(); $("dropHint").hidden = false; });
composer.addEventListener("dragleave", (e) => { if (e.target === composer) $("dropHint").hidden = true; });
composer.addEventListener("drop", (e) => { e.preventDefault(); $("dropHint").hidden = true; if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
$("input").addEventListener("paste", (e) => { const fs = Array.from(e.clipboardData?.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } });

function sendMessage() {
    const text = $("input").value.trim();
    if ((!text && state.pendingFiles.length === 0) || state.conn !== "online") return;
    const files = state.pendingFiles;
    addMessage("user", text, { files: files.map((f) => ({ name: f.name, preview: f.preview })) });
    $("input").value = ""; $("input").style.height = "auto";
    state.pendingFiles = []; renderChips();
    state.busy = true;
    state.ws.send(JSON.stringify({
        type: "chat", text,
        agentProfileId: state.agentId || undefined,
        sessionId: state.sessionId,
        shared: false,
        attachments: files.map((f) => ({ name: f.name, mime: f.mime, dataBase64: f.dataBase64 })),
    }));
}
$("send").onclick = sendMessage;
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; });
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// ── utils ──
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

// Auto-enter if already signed in
if (state.token && state.user) enterApp();
