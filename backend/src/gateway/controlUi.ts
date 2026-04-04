/**
 * Control UI — single-file HTML app served by the gateway at GET /
 * Chat + agent status + sessions. No build step, no dependencies.
 */
export function buildControlUiHtml(port: number): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OYM Control</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
    --accent: #6366f1; --accent2: #8b5cf6;
    --text: #e2e8f0; --muted: #64748b; --success: #22c55e;
    --error: #ef4444; --warn: #f59e0b;
    --user-bubble: #1e3a5f; --agent-bubble: #1e2433;
    --step-bubble: #12161f;
    --font: 'Inter', system-ui, sans-serif; --mono: 'JetBrains Mono', monospace;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }

  /* Layout */
  .app { display: grid; grid-template-columns: 260px 1fr; height: 100vh; }
  .sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
  .main { display: flex; flex-direction: column; overflow: hidden; }

  /* Sidebar */
  .sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
  .sidebar-header h1 { font-size: 16px; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .sidebar-header .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--error); margin-right: 6px; transition: background .3s; }
  .sidebar-header .status-dot.connected { background: var(--success); }
  .sidebar-header .status-text { font-size: 11px; color: var(--muted); }

  .section-label { padding: 12px 16px 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }

  .agent-list, .session-list { flex: 1; overflow-y: auto; padding: 0 8px 8px; }
  .agent-card { padding: 10px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; border: 1px solid transparent; transition: all .15s; }
  .agent-card:hover { background: rgba(99,102,241,.08); border-color: rgba(99,102,241,.2); }
  .agent-card.selected { background: rgba(99,102,241,.15); border-color: var(--accent); }
  .agent-card .name { font-weight: 600; font-size: 13px; }
  .agent-card .meta { font-size: 11px; color: var(--muted); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; }
  .status-badge.idle { background: rgba(34,197,94,.12); color: var(--success); }
  .status-badge.thinking, .status-badge.working { background: rgba(245,158,11,.12); color: var(--warn); }
  .status-badge.error { background: rgba(239,68,68,.12); color: var(--error); }
  .status-badge.offline { background: rgba(100,116,139,.12); color: var(--muted); }
  .energy-bar { height: 3px; border-radius: 2px; background: var(--border); margin-top: 6px; overflow: hidden; }
  .energy-fill { height: 100%; border-radius: 2px; transition: width .5s; }

  .session-item { padding: 8px 12px; border-radius: 6px; cursor: pointer; margin-bottom: 2px; border: 1px solid transparent; transition: all .15s; }
  .session-item:hover { background: rgba(99,102,241,.08); }
  .session-item.selected { background: rgba(99,102,241,.12); border-color: rgba(99,102,241,.3); }
  .session-item .s-key { font-size: 11px; font-weight: 600; color: var(--text); }
  .session-item .s-meta { font-size: 10px; color: var(--muted); margin-top: 1px; }

  .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }

  /* Chat area */
  .chat-header { padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--surface); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .chat-header .agent-info .name { font-weight: 700; font-size: 15px; }
  .chat-header .agent-info .sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .chat-header .actions { display: flex; gap: 8px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text); font-size: 12px; cursor: pointer; transition: all .15s; }
  .btn:hover { background: rgba(255,255,255,.06); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:hover { background: #5254cc; }
  .btn:disabled { opacity: .4; cursor: not-allowed; }

  /* Plan progress */
  .plan-bar { padding: 10px 20px; background: rgba(99,102,241,.06); border-bottom: 1px solid var(--border); display: none; }
  .plan-bar.visible { display: block; }
  .plan-bar-header { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 6px; }
  .plan-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .plan-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 2px; transition: width .4s; }

  /* Messages */
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .messages::-webkit-scrollbar { width: 4px; }
  .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .msg { display: flex; flex-direction: column; max-width: 80%; }
  .msg.user { align-self: flex-end; align-items: flex-end; }
  .msg.agent { align-self: flex-start; align-items: flex-start; }
  .msg.step { align-self: flex-start; align-items: flex-start; max-width: 90%; }

  .bubble { padding: 10px 14px; border-radius: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .msg.user .bubble { background: var(--user-bubble); border-bottom-right-radius: 3px; }
  .msg.agent .bubble { background: var(--agent-bubble); border-bottom-left-radius: 3px; }
  .msg.step .bubble { background: var(--step-bubble); border: 1px solid var(--border); font-family: var(--mono); font-size: 11px; color: var(--muted); padding: 8px 12px; }
  .msg.step .bubble .step-label { font-size: 10px; color: var(--accent); margin-bottom: 4px; font-weight: 600; }

  .msg-meta { font-size: 10px; color: var(--muted); margin-top: 3px; padding: 0 4px; }

  .thinking { display: flex; gap: 4px; align-items: center; padding: 10px 14px; background: var(--agent-bubble); border-radius: 12px; border-bottom-left-radius: 3px; }
  .thinking span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: bounce .8s infinite; }
  .thinking span:nth-child(2) { animation-delay: .15s; }
  .thinking span:nth-child(3) { animation-delay: .3s; }
  @keyframes bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }

  /* Input */
  .input-area { padding: 16px 20px; border-top: 1px solid var(--border); background: var(--surface); flex-shrink: 0; }
  .input-row { display: flex; gap: 10px; align-items: flex-end; }
  .input-wrap { flex: 1; position: relative; }
  textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: var(--font); font-size: 14px; padding: 10px 14px; resize: none; outline: none; line-height: 1.5; max-height: 160px; transition: border-color .15s; }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--muted); }
  .send-btn { width: 40px; height: 40px; border-radius: 10px; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; flex-shrink: 0; }
  .send-btn:hover { background: #5254cc; }
  .send-btn:disabled { opacity: .4; cursor: not-allowed; }
  .send-btn svg { width: 18px; height: 18px; fill: #fff; }
  .input-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }

  /* Empty state */
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--muted); }
  .empty .icon { font-size: 48px; opacity: .3; }
  .empty p { font-size: 13px; }

  /* Scrollbar */
  .agent-list::-webkit-scrollbar, .session-list::-webkit-scrollbar { width: 3px; }
  .agent-list::-webkit-scrollbar-thumb, .session-list::-webkit-scrollbar-thumb { background: var(--border); }
</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>OYM Control</h1>
      <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
        <span class="status-dot" id="dot"></span>
        <span class="status-text" id="conn-status">Connecting...</span>
      </div>
    </div>

    <div class="section-label">Agents</div>
    <div class="agent-list" id="agent-list"></div>

    <div class="section-label">Sessions</div>
    <div class="session-list" id="session-list"></div>

    <div class="sidebar-footer" id="sidebar-footer">Port ${port}</div>
  </aside>

  <!-- Main -->
  <main class="main">
    <div class="chat-header">
      <div class="agent-info">
        <div class="name" id="header-name">Select an agent</div>
        <div class="sub" id="header-sub">No session selected</div>
      </div>
      <div class="actions">
        <button class="btn" id="btn-new-session" onclick="newSession()">New session</button>
      </div>
    </div>

    <div class="plan-bar" id="plan-bar">
      <div class="plan-bar-header">
        <span>Plan progress</span>
        <span id="plan-label">0/0</span>
      </div>
      <div class="plan-track"><div class="plan-fill" id="plan-fill" style="width:0%"></div></div>
    </div>

    <div class="messages" id="messages">
      <div class="empty">
        <div class="icon">🤖</div>
        <p>Select an agent and session to start chatting</p>
      </div>
    </div>

    <div class="input-area">
      <div class="input-row">
        <div class="input-wrap">
          <textarea id="input" placeholder="Message your agent... (Enter to send, Shift+Enter for newline)" rows="1"></textarea>
        </div>
        <button class="send-btn" id="send-btn" onclick="sendMessage()" disabled>
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div class="input-hint">Enter to send · Shift+Enter for newline · /help for commands</div>
    </div>
  </main>
</div>

<script>
const WS_URL = 'ws://' + location.host;
let socket = null;
let agents = [];
let sessions = [];
let selectedAgentId = null;
let selectedSessionKey = null;
let isWaiting = false;
let thinkingEl = null;

// ── WebSocket ────────────────────────────────────────────────────────────────
function connect() {
  socket = new WebSocket(WS_URL);
  socket.addEventListener('open', () => {
    setConnected(true);
  });
  socket.addEventListener('close', () => {
    setConnected(false);
    setTimeout(connect, 2000);
  });
  socket.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    handleEvent(msg);
  });
}

function emit(event, data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event, data }));
  }
}

// socket.io compat: server sends { type, data } or socket.io packets
function handleEvent(raw) {
  // socket.io sends "42[event, data]" as text — handle both
  let event, data;
  if (typeof raw === 'string') {
    try {
      const m = raw.match(/^\\d+\\[(.+)\\]$/s);
      if (m) { const arr = JSON.parse('[' + m[1] + ']'); event = arr[0]; data = arr[1]; }
    } catch {}
  } else {
    event = raw.event || raw.type;
    data = raw.data || raw;
  }
  if (!event) return;
  dispatch(event, data);
}

function dispatch(event, data) {
  switch (event) {
    case 'agents:list': renderAgents(data.agents || []); break;
    case 'sessions:list': renderSessions(data.sessions || []); break;
    case 'agent:status': onAgentStatus(data); break;
    case 'agent:step': onAgentStep(data); break;
    case 'task:result': onTaskResult(data); break;
    case 'task:error': onTaskError(data); break;
  }
}

// ── Connection state ─────────────────────────────────────────────────────────
function setConnected(ok) {
  document.getElementById('dot').className = 'status-dot' + (ok ? ' connected' : '');
  document.getElementById('conn-status').textContent = ok ? 'Connected' : 'Reconnecting...';
}

// ── Agents ───────────────────────────────────────────────────────────────────
function renderAgents(list) {
  agents = list;
  const el = document.getElementById('agent-list');
  el.innerHTML = list.map(a => \`
    <div class="agent-card \${a.id === selectedAgentId ? 'selected' : ''}" onclick="selectAgent('\${a.id}')">
      <div class="name">\${a.name}</div>
      <div class="meta">
        <span class="status-badge \${a.status}">\${a.status}</span>
        <span>\${a.llm?.model || ''}</span>
      </div>
      <div class="energy-bar">
        <div class="energy-fill" style="width:\${a.energy}%;background:\${a.energy>60?'#22c55e':a.energy>25?'#f59e0b':'#ef4444'}"></div>
      </div>
    </div>
  \`).join('');
}

function selectAgent(id) {
  selectedAgentId = id;
  const agent = agents.find(a => a.id === id);
  document.getElementById('header-name').textContent = agent?.name || id;
  renderAgents(agents);
  updateSendBtn();
}

function onAgentStatus(data) {
  agents = agents.map(a => a.id === data.agentId ? { ...a, status: data.status } : a);
  renderAgents(agents);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function renderSessions(list) {
  sessions = list;
  const el = document.getElementById('session-list');
  if (!list.length) { el.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--muted)">No sessions yet</div>'; return; }
  el.innerHTML = list.map(s => \`
    <div class="session-item \${s.sessionKey === selectedSessionKey ? 'selected' : ''}" onclick="selectSession('\${s.sessionKey}')">
      <div class="s-key">\${s.channel.toUpperCase()} · \${s.userId}</div>
      <div class="s-meta">\${s.messageCount} msgs · \${new Date(s.lastActivity).toLocaleTimeString()}</div>
    </div>
  \`).join('');
}

function selectSession(key) {
  selectedSessionKey = key;
  const s = sessions.find(x => x.sessionKey === key);
  document.getElementById('header-sub').textContent = s ? \`\${s.channel} · \${s.userId}\` : key;
  renderSessions(sessions);
  clearMessages();
  updateSendBtn();
}

function newSession() {
  if (!selectedAgentId) return;
  const key = \`web:user-\${Date.now()}:\${selectedAgentId}\`;
  selectSession(key);
}

// ── Messages ─────────────────────────────────────────────────────────────────
function clearMessages() {
  document.getElementById('messages').innerHTML = '';
  hidePlan();
}

function addMessage(role, content, isStep = false) {
  const el = document.getElementById('messages');
  // Remove empty state
  el.querySelector('.empty')?.remove();
  // Remove thinking indicator
  if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }

  const div = document.createElement('div');
  div.className = \`msg \${isStep ? 'step' : role}\`;

  if (isStep) {
    div.innerHTML = \`<div class="bubble"><div class="step-label">⚙ Agent thinking</div>\${escHtml(content)}</div>\`;
  } else {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = \`<div class="bubble">\${escHtml(content)}</div><div class="msg-meta">\${time}</div>\`;
  }
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

function showThinking() {
  const el = document.getElementById('messages');
  el.querySelector('.empty')?.remove();
  thinkingEl = document.createElement('div');
  thinkingEl.className = 'msg agent';
  thinkingEl.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>';
  el.appendChild(thinkingEl);
  el.scrollTop = el.scrollHeight;
}

function onAgentStep(data) {
  if (data.agentId !== selectedAgentId) return;
  if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }

  const parts = [];
  if (data.planProgress) updatePlan(data.planProgress);
  if (data.thought) parts.push('💭 ' + data.thought);
  if (data.tool) {
    const p = data.params ? ' (' + Object.entries(data.params).map(([k,v]) => k + ': ' + String(v).slice(0,50)).join(', ') + ')' : '';
    parts.push('🔧 ' + data.tool + p);
  }
  if (data.result) parts.push('✅ ' + data.result.slice(0, 300));
  if (parts.length) addMessage('agent', parts.join('\\n'), true);
}

function onTaskResult(data) {
  if (data.agentId !== selectedAgentId) return;
  isWaiting = false;
  hidePlan();
  addMessage('agent', data.result);
  updateSendBtn();
}

function onTaskError(data) {
  if (data.agentId !== selectedAgentId) return;
  isWaiting = false;
  hidePlan();
  addMessage('agent', '❌ Error: ' + data.error);
  updateSendBtn();
}

// ── Plan bar ─────────────────────────────────────────────────────────────────
function updatePlan(progress) {
  const [cur, tot] = progress.split('/').map(Number);
  if (!tot) return;
  document.getElementById('plan-bar').classList.add('visible');
  document.getElementById('plan-label').textContent = progress;
  document.getElementById('plan-fill').style.width = (cur / tot * 100) + '%';
}
function hidePlan() {
  document.getElementById('plan-bar').classList.remove('visible');
}

// ── Send ─────────────────────────────────────────────────────────────────────
function sendMessage() {
  const ta = document.getElementById('input');
  const text = ta.value.trim();
  if (!text || !selectedAgentId || !selectedSessionKey || isWaiting) return;

  addMessage('user', text);
  ta.value = '';
  ta.style.height = 'auto';
  isWaiting = true;
  updateSendBtn();
  showThinking();

  // Emit via socket.io protocol
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send('42' + JSON.stringify(['task:create', { agentId: selectedAgentId, description: text, sessionKey: selectedSessionKey }]));
  }
}

function updateSendBtn() {
  const btn = document.getElementById('send-btn');
  btn.disabled = !selectedAgentId || !selectedSessionKey || isWaiting;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Input auto-resize + Enter key ────────────────────────────────────────────
const ta = document.getElementById('input');
ta.addEventListener('input', () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
});
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Socket.io handshake ──────────────────────────────────────────────────────
// socket.io sends "0{...}" on connect, "40" for namespace connect, "2" for ping
// We need to respond to pings with "3" and handle "42[event,data]" messages
function connectSocketIO() {
  const url = 'ws://' + location.host + '/socket.io/?EIO=4&transport=websocket';
  socket = new WebSocket(url);

  socket.addEventListener('open', () => setConnected(true));
  socket.addEventListener('close', () => { setConnected(false); setTimeout(connectSocketIO, 2000); });

  socket.addEventListener('message', (e) => {
    const raw = e.data;
    if (raw === '2') { socket.send('3'); return; } // ping/pong
    if (raw.startsWith('0')) { socket.send('40'); return; } // connect namespace
    if (raw.startsWith('42')) {
      try {
        const arr = JSON.parse(raw.slice(2));
        dispatch(arr[0], arr[1]);
      } catch {}
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
connectSocketIO();
</script>
</body>
</html>`;
}
