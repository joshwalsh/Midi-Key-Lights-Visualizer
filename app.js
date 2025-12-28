// MIDI Key Lights - Canvas-based MIDI visualizer for Ecamm Live overlays

let config = null;
let canvas = null;
let ctx = null;
let activeNotes = new Set();
let keysByNote = {};
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
    }
  } else if (isNoteOff) {
    const noteName = getNoteName(note);
    logMIDI(`NOTE OFF: ${noteName} (${note}) ch=${channel} | ${hexData}`);

    // Don't remove the note if we're editing it
    if (note !== editingNote) {
      activeNotes.delete(note);
    }
  }
}

// Render loop
function render() {
  // Clear canvas to transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw only active keys
  const { top, bottom } = config.keyBounds;

  for (const note of activeNotes) {
    const key = keysByNote[note];
    if (!key) continue;

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

    // Create gradient from color at top to transparent at bottom
    const gradient = ctx.createLinearGradient(0, keyTop, 0, keyBottom);
    const color = key.color || config.colors.active;
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fill();
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
