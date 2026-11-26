const DEFAULT_SERVER_URL = 'http://10.10.1.193:3000';

const setupPanel = document.getElementById('setup');
const gamePanel = document.getElementById('game');
const setupError = document.getElementById('setupError');

const serverUrlInput = document.getElementById('serverUrl');
const roomNameInput = document.getElementById('roomName');
const identityInput = document.getElementById('identity');
const autoSpeakInput = document.getElementById('autoSpeak');

const log = document.getElementById('log');
const choicesEl = document.getElementById('choices');
const commandForm = document.getElementById('commandForm');
const commandInput = document.getElementById('commandInput');
const micBtn = document.getElementById('micBtn');

let session = null; // { serverUrl, roomName, identity }

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function loadSaved() {
  serverUrlInput.value = localStorage.getItem('dw_serverUrl') || DEFAULT_SERVER_URL;
  roomNameInput.value = localStorage.getItem('dw_roomName') || 'campaign-dev';
  identityInput.value = localStorage.getItem('dw_identity') || `player-${Math.floor(Math.random() * 1000)}`;
}

async function enterWorld() {
  const serverUrl = serverUrlInput.value.trim() || DEFAULT_SERVER_URL;
  const roomName = roomNameInput.value.trim();
  const identity = identityInput.value.trim();

  if (!roomName || !identity) {
    setupError.textContent = 'Room name and your name are both required.';
    return;
  }

  setupError.textContent = '';
  session = { serverUrl: serverUrl.replace(/\/$/, ''), roomName, identity };

  localStorage.setItem('dw_serverUrl', session.serverUrl);
  localStorage.setItem('dw_roomName', session.roomName);
  localStorage.setItem('dw_identity', session.identity);

  try {
    const res = await fetch(`${session.serverUrl}/healthz`);
    if (!res.ok) throw new Error('unhealthy');
  } catch {
    setupError.textContent = `Could not reach ${session.serverUrl}. Check the server URL and try again.`;
    session = null;
    return;
  }

  setupPanel.classList.add('hidden');
  gamePanel.classList.remove('hidden');
  await sendCommand('look');
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

function appendLine(text, className) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function speak(text) {
  if (!autoSpeakInput.checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function renderChoices(choices) {
  choicesEl.innerHTML = '';
  (choices || []).forEach((choice) => {
    const btn = document.createElement('button');
    btn.textContent = choice;
    btn.addEventListener('click', () => sendCommand(choice));
    choicesEl.appendChild(btn);
  });
}

async function sendCommand(text) {
  if (!session || !text) return;

  appendLine(`> ${text}`, 'you');
  commandInput.value = '';

  try {
    const res = await fetch(`${session.serverUrl}/api/say`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: session.roomName, identity: session.identity, text }),
    });

    if (res.status === 429) {
      appendLine('One at a time.', 'system');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      appendLine(`Error: ${body.message || res.statusText}`, 'system');
      return;
    }

    const data = await res.json();
    if (data.text) {
      appendLine(data.text, 'narration');
      speak(data.text);
    }
    renderChoices(data.choices);
  } catch (err) {
    appendLine(`Connection lost: ${err.message}`, 'system');
  }
}

commandForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendCommand(commandInput.value.trim());
});

document.getElementById('quickActions').addEventListener('click', (e) => {
  const cmd = e.target.dataset.cmd;
  if (cmd) sendCommand(cmd);
});

document.getElementById('enterBtn').addEventListener('click', enterWorld);

// ---------------------------------------------------------------------------
// Voice input (Web Speech API) — optional, degrades to text-only silently
// ---------------------------------------------------------------------------

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let listening = false;

if (SpeechRecognition) {
  recognizer = new SpeechRecognition();
  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.lang = 'en-US';

  recognizer.addEventListener('result', (e) => {
    const transcript = e.results[0][0].transcript;
    sendCommand(transcript);
  });

  recognizer.addEventListener('end', () => {
    listening = false;
    micBtn.classList.remove('listening');
  });

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognizer.stop();
      return;
    }
    listening = true;
    micBtn.classList.add('listening');
    recognizer.start();
  });
} else {
  micBtn.disabled = true;
  micBtn.title = 'Voice input not supported in this browser';
}

loadSaved();
