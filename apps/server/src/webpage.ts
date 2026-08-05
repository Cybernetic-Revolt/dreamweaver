/**
 * Dreamweaver web client.
 *
 * A single self-contained HTML page served by the game server at GET /.
 * It talks to the same-origin POST /command endpoint, shows the GM narration,
 * renders suggested choices, and (voice-first) can listen via the browser mic
 * and read narration aloud. No app install required.
 */

export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Dreamweaver</title>
<style>
  :root {
    --bg:#0d0b14; --panel:#161226; --panel2:#1e1832; --edge:#2c2444;
    --ink:#ece7ff; --dim:#a99fce; --accent:#b98bff; --accent2:#7c5cff;
    --gm:#f0e9ff; --you:#8fd0ff; --ok:#6ee7a8; --warn:#ffcf6e;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; }
  body {
    background:radial-gradient(1200px 800px at 50% -10%, #1c1636 0%, var(--bg) 60%);
    color:var(--ink); font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    display:flex; flex-direction:column; height:100dvh;
  }
  header {
    padding:14px 18px; border-bottom:1px solid var(--edge);
    display:flex; align-items:center; gap:12px; background:rgba(22,18,38,.7); backdrop-filter:blur(6px);
  }
  header .logo { font-size:22px; }
  header h1 { font-size:18px; margin:0; letter-spacing:.5px; font-weight:600; }
  header .sub { color:var(--dim); font-size:12px; margin-left:auto; display:flex; gap:14px; align-items:center; }
  header .dot { width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok); }
  #log { flex:1; overflow-y:auto; padding:22px 18px 8px; display:flex; flex-direction:column; gap:14px; }
  .msg { max-width:760px; width:100%; margin:0 auto; }
  .gm { color:var(--gm); font-size:18px; line-height:1.7; }
  .gm::before { content:"❖ "; color:var(--accent); }
  .you { color:var(--you); text-align:right; font-style:italic; }
  .you::after { content:" ⟶"; opacity:.5; }
  .sys { color:var(--dim); font-size:13px; text-align:center; }
  .choices { max-width:760px; margin:2px auto 0; width:100%; display:flex; flex-wrap:wrap; gap:8px; }
  .choice {
    background:var(--panel2); color:var(--ink); border:1px solid var(--edge);
    padding:7px 13px; border-radius:20px; cursor:pointer; font-size:14px; transition:.15s;
  }
  .choice:hover { border-color:var(--accent); background:#241c3e; }
  footer {
    border-top:1px solid var(--edge); padding:12px 14px; background:rgba(22,18,38,.8);
    display:flex; gap:9px; align-items:center; max-width:820px; margin:0 auto; width:100%;
  }
  #input {
    flex:1; background:var(--panel); border:1px solid var(--edge); color:var(--ink);
    padding:13px 15px; border-radius:12px; font-size:16px; outline:none;
  }
  #input:focus { border-color:var(--accent2); }
  button.act {
    border:none; border-radius:12px; padding:0 16px; height:48px; cursor:pointer; font-size:18px;
    background:var(--accent2); color:#fff; transition:.15s; display:flex; align-items:center; justify-content:center;
  }
  button.act:hover { background:var(--accent); }
  button.act:disabled { opacity:.45; cursor:default; }
  #mic { background:var(--panel2); color:var(--accent); border:1px solid var(--edge); }
  #mic.on { background:#ff5d73; color:#fff; border-color:#ff5d73; animation:pulse 1.1s infinite; }
  #speak.off { opacity:.4; }
  @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,93,115,.5);} 50%{box-shadow:0 0 0 8px rgba(255,93,115,0);} }
  .thinking { color:var(--dim); font-style:italic; }
  .thinking span { animation:blink 1.2s infinite; }
  @keyframes blink { 0%,100%{opacity:.3;} 50%{opacity:1;} }
</style>
</head>
<body>
  <header>
    <span class="logo">🜲</span>
    <h1>Dreamweaver</h1>
    <div class="sub"><span class="dot" id="status"></span><span id="statusText">connecting…</span>
      <button id="speak" class="act" title="Toggle narration voice" style="height:32px;font-size:15px;background:var(--panel2);color:var(--accent);border:1px solid var(--edge);">🔊</button>
    </div>
  </header>
  <div id="log"></div>
  <footer>
    <input id="input" placeholder="What do you do?  (try: look around)" autocomplete="off" />
    <button id="mic" class="act" title="Speak">🎙️</button>
    <button id="send" class="act" title="Send">➤</button>
  </footer>

<script>
const room = (() => {
  let r = localStorage.getItem('dw_room');
  if (!r) { r = 'web-' + Math.random().toString(36).slice(2, 9); localStorage.setItem('dw_room', r); }
  return r;
})();
const identity = 'player';
const log = document.getElementById('log');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic');
const speakBtn = document.getElementById('speak');
const statusDot = document.getElementById('status');
const statusText = document.getElementById('statusText');
let speakOn = localStorage.getItem('dw_speak') !== '0';
let busy = false;

function setStatus(text, color) { statusText.textContent = text; statusDot.style.background = color; statusDot.style.boxShadow = '0 0 8px ' + color; }
function reflectSpeak() { speakBtn.textContent = speakOn ? '🔊' : '🔇'; speakBtn.classList.toggle('off', !speakOn); }
reflectSpeak();

function addMsg(cls, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls; d.textContent = text;
  log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
}
function addChoices(choices) {
  if (!choices || !choices.length) return;
  const wrap = document.createElement('div'); wrap.className = 'choices';
  choices.forEach(c => {
    const b = document.createElement('button'); b.className = 'choice'; b.textContent = c;
    b.onclick = () => submit(c);
    wrap.appendChild(b);
  });
  log.appendChild(wrap); log.scrollTop = log.scrollHeight;
}
function speak(text) {
  if (!speakOn || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98; u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

async function submit(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true; input.value = '';
  addMsg('you', text);
  const thinking = addMsg('gm thinking', 'The world stirs');
  let dots = 0; const anim = setInterval(() => { thinking.textContent = 'The world stirs' + '.'.repeat(dots = (dots+1)%4); }, 350);
  try {
    const res = await fetch('/command', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ roomName: room, identity, text })
    });
    const data = await res.json();
    clearInterval(anim); thinking.remove();
    if (data.narration) {
      addMsg('gm', data.narration);
      speak(data.narration);
      addChoices(data.choices);
    } else if (data.status === 'rejected') {
      addMsg('sys', 'One at a time — let the last action finish.');
    } else {
      addMsg('sys', '(the GM is silent…)');
    }
    setStatus('ready', 'var(--ok)');
  } catch (e) {
    clearInterval(anim); thinking.remove();
    addMsg('sys', '⚠ Could not reach the game server.');
    setStatus('offline', '#ff5d73');
  } finally {
    busy = false; sendBtn.disabled = false; input.focus();
  }
}

sendBtn.onclick = () => submit(input.value);
input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(input.value); });
speakBtn.onclick = () => { speakOn = !speakOn; localStorage.setItem('dw_speak', speakOn ? '1':'0'); reflectSpeak(); if (!speakOn && window.speechSynthesis) window.speechSynthesis.cancel(); };

// Voice input (Chrome/Edge). Falls back to text-only elsewhere.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  let listening = false;
  micBtn.onclick = () => { if (listening) rec.stop(); else { try { rec.start(); } catch(e){} } };
  rec.onstart = () => { listening = true; micBtn.classList.add('on'); };
  rec.onend = () => { listening = false; micBtn.classList.remove('on'); };
  rec.onresult = (e) => { const t = e.results[0][0].transcript; input.value = t; submit(t); };
  rec.onerror = () => { listening = false; micBtn.classList.remove('on'); };
} else {
  micBtn.style.display = 'none';
}

// Health check + kick off the opening scene.
(async () => {
  try {
    const h = await fetch('/health'); const hd = await h.json();
    setStatus(hd.status === 'healthy' ? 'ready' : 'degraded', hd.status === 'healthy' ? 'var(--ok)' : 'var(--warn)');
  } catch { setStatus('offline', '#ff5d73'); }
  addMsg('sys', 'Your adventure begins. Speak or type what you do.');
  submit('look around');
})();
</script>
</body>
</html>`;
