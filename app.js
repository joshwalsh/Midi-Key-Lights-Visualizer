// MIDI Key Lights - Canvas-based MIDI visualizer for Ecamm Live overlays

let config = null;
let canvas = null;
let ctx = null;
let activeNotes = new Set();
let keysByNote = {};
const statusEl = document.getElementById('status');
const midiLog = document.getElementById('midi-log');
let logMessages = [];

// Load configuration and initialize
async function init() {
  try {
    logMIDI('Loading config.json...');
    const response = await fetch('config.json');
    config = await response.json();

    // Hide debug panel if debug mode is off
    if (!config.debug) {
      document.getElementById('debug').style.display = 'none';
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
    activeNotes.add(note);
  } else if (isNoteOff) {
    const noteName = getNoteName(note);
    logMIDI(`NOTE OFF: ${noteName} (${note}) ch=${channel} | ${hexData}`);
    activeNotes.delete(note);
  }
}

// Render loop
function render() {
  // Clear canvas to transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw only active keys
  for (const note of activeNotes) {
    const key = keysByNote[note];
    if (!key || !key.points || key.points.length < 3) continue;

    ctx.beginPath();
    ctx.moveTo(key.points[0][0], key.points[0][1]);
    for (let i = 1; i < key.points.length; i++) {
      ctx.lineTo(key.points[i][0], key.points[i][1]);
    }
    ctx.closePath();

    // Fill with key-specific color or default active color
    ctx.fillStyle = key.color || config.colors.active;
    ctx.fill();

    // Optional stroke
    if (config.colors.stroke) {
      ctx.strokeStyle = config.colors.stroke;
      ctx.lineWidth = config.colors.strokeWidth || 2;
      ctx.stroke();
    }
  }

  requestAnimationFrame(render);
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
