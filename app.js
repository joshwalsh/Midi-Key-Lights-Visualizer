// MIDI Key Lights - Canvas-based MIDI visualizer for Ecamm Live overlays

let config = null;
let canvas = null;
let ctx = null;
let activeNotes = new Set();      // Notes physically held down
let sustainedNotes = new Set();   // Notes held only by sustain pedal
let keysByNote = {};
let sustainPedalDown = false;

// Particle system for sparkle effects
let particles = [];
const MAX_PARTICLES = 100;

function spawnParticles(note) {
  const key = keysByNote[note];
  if (!key || key.hidden) return;

  const particleConfig = config.effects?.particles;
  if (particleConfig?.enabled === false) return;

  const baseCount = particleConfig?.count ?? 2;
  const count = Math.floor(Math.random() * baseCount) + 1; // 1 to count particles
  const color = key.color || config.colors.active;
  const keyTop = config.keyBounds.top + (key.offset || 0);

  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    particles.push({
      x: key.left + Math.random() * key.width,
      y: keyTop,
      vx: (Math.random() - 0.5) * 0.5,  // slight horizontal drift
      vy: -(Math.random() * 1 + 0.5) * (particleConfig?.speed ?? 1.5),  // upward
      alpha: 1,
      size: (Math.random() * 2 + 2) * (particleConfig?.size ?? 1),  // 2-4px base
      color: color,
      life: particleConfig?.lifetime ?? 1000,
      born: performance.now()
    });
  }
}

function updateParticles() {
  const now = performance.now();
  particles = particles.filter(p => {
    const age = now - p.born;
    if (age > p.life) return false;

    p.x += p.vx;
    p.y += p.vy;
    p.alpha = 1 - (age / p.life);  // fade out over lifetime
    return true;
  });
}

function drawParticles() {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(p.color, p.alpha);
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const statusEl = document.getElementById('status');
const midiLog = document.getElementById('midi-log');
let logMessages = [];

// Edit mode state
let editingNote = null;
const editPanel = document.getElementById('edit-panel');
const editKeyName = document.getElementById('edit-key-name');
const editLeft = document.getElementById('edit-left');
const editWidth = document.getElementById('edit-width');
const editOffset = document.getElementById('edit-offset');
const leftValue = document.getElementById('left-value');
const widthValue = document.getElementById('width-value');
const offsetValue = document.getElementById('offset-value');
const saveKeyBtn = document.getElementById('save-key');
const prevKeyBtn = document.getElementById('prev-key');
const nextKeyBtn = document.getElementById('next-key');

// Load configuration and initialize
async function init() {
  try {
    logMIDI('Loading config.json...');
    const response = await fetch('config.json?t=' + Date.now());
    config = await response.json();

    // Hide debug panel if debug mode is off
    if (!config.debug) {
      document.getElementById('debug').style.display = 'none';
    }

    // Show edit panel if edit mode is on
    if (config.editMode) {
      editPanel.classList.add('active');
    }

    logMIDI(`Config loaded: ${config.keys.length} keys defined`);

    setupCanvas();
    logMIDI(`Canvas: ${canvas.width}x${canvas.height}`);

    buildKeyMap();
    logMIDI(`Key map built: notes ${Object.keys(keysByNote).sort((a,b)=>a-b).join(', ')}`);

    await initMIDI();

    // Hide status after successful connection
    setTimeout(() => statusEl.classList.add('hidden'), 2000);

    // Start render loop
    requestAnimationFrame(render);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    logMIDI(`ERROR: ${err.message}`);
    console.error('Initialization failed:', err);
  }
}

// Set up the canvas element
function setupCanvas() {
  canvas = document.getElementById('keyboard');
  ctx = canvas.getContext('2d');

  canvas.width = config.canvas.width;
  canvas.height = config.canvas.height;
}

// Build a lookup map from MIDI note number to key config
function buildKeyMap() {
  keysByNote = {};
  for (const key of config.keys) {
    keysByNote[key.note] = key;
  }
}

// Initialize Web MIDI API
async function initMIDI() {
  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API not supported in this browser');
  }

  const midiAccess = await navigator.requestMIDIAccess();

  // Listen to all MIDI inputs
  logMIDI(`Found ${midiAccess.inputs.size} MIDI input(s)`);
  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = handleMIDIMessage;
    logMIDI(`Connected: ${input.name} (${input.manufacturer})`);
  }

  // Handle new devices being connected
  midiAccess.onstatechange = (e) => {
    if (e.port.type === 'input') {
      if (e.port.state === 'connected') {
        e.port.onmidimessage = handleMIDIMessage;
        logMIDI(`MIDI connected: ${e.port.name}`);
      } else {
        logMIDI(`MIDI disconnected: ${e.port.name}`);
      }
    }
  };

  const inputCount = midiAccess.inputs.size;
  statusEl.textContent = inputCount > 0
    ? `Connected to ${inputCount} MIDI device(s)`
    : 'No MIDI devices found';
}

// Log to debug panel
function logMIDI(message) {
  const timestamp = new Date().toLocaleTimeString();
  logMessages.unshift(`[${timestamp}] ${message}`);
  if (logMessages.length > 50) logMessages.pop();
  midiLog.textContent = logMessages.join('\n');
}

// Lighten a hex color by a percentage (0-1)
function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

// Get note name from MIDI number
function getNoteName(note) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave}`;
}

// Handle incoming MIDI messages
function handleMIDIMessage(event) {
  const [status, note, velocity] = event.data;
  const channel = (status & 0x0F) + 1;
  const msgType = status & 0xF0;

  // Log all MIDI data
  const hexData = Array.from(event.data).map(b => b.toString(16).padStart(2, '0')).join(' ');

  // Note On: 0x90 (144) with velocity > 0
  // Note Off: 0x80 (128) OR 0x90 with velocity = 0
  const isNoteOn = msgType === 0x90 && velocity > 0;
  const isNoteOff = msgType === 0x80 || (msgType === 0x90 && velocity === 0);

  // Check for sustain pedal (CC 64)
  const isCC = (msgType === 0xB0);
  if (isCC && note === 64) {
    sustainPedalDown = velocity >= 64;
    logMIDI(`SUSTAIN: ${sustainPedalDown ? 'DOWN' : 'UP'} | ${hexData}`);
    // When pedal is released, clear all sustained notes
    if (!sustainPedalDown) {
      sustainedNotes.clear();
    }
    return;
  }

  if (isNoteOn) {
    const noteName = getNoteName(note);
    const hasKey = keysByNote[note] ? 'OK' : 'NO KEY';
    logMIDI(`NOTE ON:  ${noteName} (${note}) vel=${velocity} ch=${channel} [${hasKey}] | ${hexData}`);

    if (config.editMode) {
      // In edit mode, select this key for editing
      if (editingNote !== null) {
        activeNotes.delete(editingNote);
      }
      selectKeyForEdit(note);
    } else {
      activeNotes.add(note);
      spawnParticles(note);
    }
  } else if (isNoteOff) {
    const noteName = getNoteName(note);
    logMIDI(`NOTE OFF: ${noteName} (${note}) ch=${channel} | ${hexData}`);

    // Don't remove the note if we're editing it
    if (note !== editingNote) {
      activeNotes.delete(note);
      // If sustain pedal is down, move to sustained notes
      if (sustainPedalDown) {
        sustainedNotes.add(note);
      }
    }
  }
}

// Render loop
function render() {
  // Clear canvas to transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update and draw particles
  updateParticles();
  drawParticles();

  // Draw active and sustained keys
  const { top, bottom } = config.keyBounds;

  // Helper to draw a key with a given color
  function drawKey(note, color) {
    const key = keysByNote[note];
    if (!key || key.hidden) return;

    const offset = key.offset || 0;
    const keyTop = top + offset;
    const keyBottom = bottom + offset;
    const left = key.left;
    const right = key.left + key.width;

    ctx.beginPath();
    ctx.moveTo(left, keyTop);
    ctx.lineTo(right, keyTop);
    ctx.lineTo(right, keyBottom);
    ctx.lineTo(left, keyBottom);
    ctx.closePath();

    // Add glow effect if enabled
    const glowConfig = config.effects?.glow;
    if (glowConfig?.enabled !== false) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glowConfig?.blur ?? 20;
      ctx.shadowOffsetY = glowConfig?.offsetY ?? -10;
    }

    const gradient = ctx.createLinearGradient(0, keyTop, 0, keyBottom);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fill();

    if (glowConfig?.enabled !== false) {
      ctx.restore();
    }
  }

  // Draw sustained notes (pedal holding them) - lighter based on config
  const lightenAmount = config.colors.sustainedLighten ?? 0.15;
  const sustainedColor = lightenColor(config.colors.active, lightenAmount);
  for (const note of sustainedNotes) {
    drawKey(note, sustainedColor);
  }

  // Draw active notes (physically held down) - drawn on top
  for (const note of activeNotes) {
    const key = keysByNote[note];
    const color = key?.color || config.colors.active;
    drawKey(note, color);
  }

  requestAnimationFrame(render);
}

// Edit mode functions
function selectKeyForEdit(note) {
  const key = keysByNote[note];
  if (!key) return;

  editingNote = note;
  editKeyName.textContent = `${key.name} (${note})`;
  editLeft.value = key.left;
  editWidth.value = key.width;
  editOffset.value = key.offset || 0;
  leftValue.textContent = key.left;
  widthValue.textContent = key.width;
  offsetValue.textContent = key.offset || 0;

  // Keep this key visually active while editing
  activeNotes.add(note);
}

function updateKeyFromInputs() {
  if (editingNote === null) return;

  const key = keysByNote[editingNote];
  if (!key) return;

  key.left = parseInt(editLeft.value, 10);
  key.width = parseInt(editWidth.value, 10);
  const offset = parseInt(editOffset.value, 10);
  key.offset = offset !== 0 ? offset : undefined;
  leftValue.textContent = key.left;
  widthValue.textContent = key.width;
  offsetValue.textContent = offset;
}

async function saveConfig() {
  updateKeyFromInputs();

  try {
    const response = await fetch('/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    if (response.ok) {
      logMIDI('Config saved!');
    } else {
      logMIDI('Failed to save config');
    }
  } catch (err) {
    logMIDI(`Save error: ${err.message}`);
  }
}

function navigateKey(direction) {
  if (editingNote === null) return;

  const notes = config.keys.map(k => k.note).sort((a, b) => a - b);
  const currentIndex = notes.indexOf(editingNote);
  const newIndex = currentIndex + direction;

  if (newIndex >= 0 && newIndex < notes.length) {
    activeNotes.delete(editingNote);
    selectKeyForEdit(notes[newIndex]);
  }
}

// Live update while editing
editLeft.addEventListener('input', updateKeyFromInputs);
editWidth.addEventListener('input', updateKeyFromInputs);
editOffset.addEventListener('input', updateKeyFromInputs);

// Button handlers
saveKeyBtn.addEventListener('click', saveConfig);
prevKeyBtn.addEventListener('click', () => navigateKey(-1));
nextKeyBtn.addEventListener('click', () => navigateKey(1));

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
