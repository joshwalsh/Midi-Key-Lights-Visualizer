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
let editingKeyPhysicallyPressed = false;  // Is the key being edited currently held down?
let selectedProperty = null;  // 'left', 'width', or 'offset' - for keyboard nudging
const editPanel = document.getElementById('edit-panel');
const editKeyName = document.getElementById('edit-key-name');
const editModeState = document.getElementById('edit-mode-state');
const editLeft = document.getElementById('edit-left');
const editWidth = document.getElementById('edit-width');
const editOffset = document.getElementById('edit-offset');
const leftLabel = document.getElementById('left-label');
const widthLabel = document.getElementById('width-label');
const offsetLabel = document.getElementById('offset-label');
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
      // In edit mode, check if this is the same key we're editing
      if (note === editingNote) {
        // Same key pressed - switch to editing pressed state
        setEditingPressed(true);
      } else {
        // Different key - select it for editing
        if (editingNote !== null) {
          activeNotes.delete(editingNote);
        }
        // Set pressed state BEFORE selecting so loadEditValues gets correct state
        editingKeyPhysicallyPressed = true;
        selectKeyForEdit(note);
        updateEditModeStateUI();
      }
    } else {
      activeNotes.add(note);
      spawnParticles(note);
    }
  } else if (isNoteOff) {
    const noteName = getNoteName(note);
    logMIDI(`NOTE OFF: ${noteName} (${note}) ch=${channel} | ${hexData}`);

    if (config.editMode && note === editingNote) {
      // Key released while editing - switch to editing up state
      setEditingPressed(false);
    } else if (note !== editingNote) {
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
  // isPressed: whether to apply pressed offsets (for active notes)
  function drawKey(note, color, isPressed = false) {
    const key = keysByNote[note];
    if (!key || key.hidden) return;

    const offset = key.offset || 0;
    const keyTop = top + offset;
    const keyBottom = bottom + offset;

    // Apply pressed offsets when key is active
    const pressedLeftOffset = isPressed ? (key.pressedLeftOffset || 0) : 0;
    const pressedWidthOffset = isPressed ? (key.pressedWidthOffset || 0) : 0;
    const left = key.left + pressedLeftOffset;
    const right = key.left + pressedLeftOffset + key.width + pressedWidthOffset;

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

  // Draw active notes (physically held down) - drawn on top with pressed offsets
  for (const note of activeNotes) {
    const key = keysByNote[note];
    const color = key?.color || config.colors.active;
    drawKey(note, color, true);
  }

  // In edit mode, draw the editing key if not already drawn (when key is up)
  if (config.editMode && editingNote !== null && !activeNotes.has(editingNote) && !sustainedNotes.has(editingNote)) {
    const key = keysByNote[editingNote];
    const color = key?.color || config.colors.active;
    drawKey(editingNote, color, false);  // Draw without pressed offsets
  }

  requestAnimationFrame(render);
}

// Edit mode functions
function setEditingPressed(pressed) {
  editingKeyPhysicallyPressed = pressed;
  updateEditModeStateUI();
  loadEditValues();

  // Update activeNotes to reflect visual state
  if (editingNote !== null) {
    if (pressed) {
      activeNotes.add(editingNote);
    } else {
      activeNotes.delete(editingNote);
    }
  }
}

function updateEditModeStateUI() {
  const editModeHint = document.getElementById('edit-mode-hint');

  if (editModeState) {
    if (editingKeyPhysicallyPressed) {
      editModeState.textContent = 'PRESSED';
      editModeState.style.color = '#ff9500';
      if (editModeHint) editModeHint.textContent = '(release key to edit up position)';
      // Update labels for pressed offset mode
      if (leftLabel) leftLabel.textContent = 'Left Offset (pressed)';
      if (widthLabel) widthLabel.textContent = 'Width Offset (pressed)';
      if (offsetLabel) offsetLabel.textContent = 'Vertical Offset (disabled)';
      // Update slider ranges for offsets
      editLeft.min = -50;
      editLeft.max = 50;
      editWidth.min = -25;
      editWidth.max = 25;
    } else {
      editModeState.textContent = 'UP';
      editModeState.style.color = '#00ff00';
      if (editModeHint) editModeHint.textContent = '(hold key to edit pressed position)';
      // Update labels for base values
      if (leftLabel) leftLabel.textContent = 'Left (x position)';
      if (widthLabel) widthLabel.textContent = 'Width';
      if (offsetLabel) offsetLabel.textContent = 'Vertical Offset';
      // Restore slider ranges for base values
      editLeft.min = 0;
      editLeft.max = 3840;
      editWidth.min = 0;
      editWidth.max = 100;
    }
  }
}

function loadEditValues() {
  if (editingNote === null) return;

  const key = keysByNote[editingNote];
  if (!key) return;

  if (editingKeyPhysicallyPressed) {
    // Load pressed offset values
    editLeft.value = key.pressedLeftOffset || 0;
    editWidth.value = key.pressedWidthOffset || 0;
    editOffset.value = 0;  // Not used for pressed state
    editOffset.disabled = true;
    leftValue.textContent = key.pressedLeftOffset || 0;
    widthValue.textContent = key.pressedWidthOffset || 0;
    offsetValue.textContent = '-';
  } else {
    // Load base (up) values
    editLeft.value = key.left;
    editWidth.value = key.width;
    editOffset.value = key.offset || 0;
    editOffset.disabled = false;
    leftValue.textContent = key.left;
    widthValue.textContent = key.width;
    offsetValue.textContent = key.offset || 0;
  }
}

function selectKeyForEdit(note) {
  const key = keysByNote[note];
  if (!key) return;

  editingNote = note;
  editKeyName.textContent = `${key.name} (${note})`;
  loadEditValues();

  // Keep this key visually active while editing
  activeNotes.add(note);
}

function updateKeyFromInputs() {
  if (editingNote === null) return;

  const key = keysByNote[editingNote];
  if (!key) return;

  if (editingKeyPhysicallyPressed) {
    // Update pressed offset values
    const pressedLeftOffset = parseInt(editLeft.value, 10);
    const pressedWidthOffset = parseInt(editWidth.value, 10);
    key.pressedLeftOffset = pressedLeftOffset !== 0 ? pressedLeftOffset : undefined;
    key.pressedWidthOffset = pressedWidthOffset !== 0 ? pressedWidthOffset : undefined;
    leftValue.textContent = pressedLeftOffset;
    widthValue.textContent = pressedWidthOffset;
  } else {
    // Update base (up) values
    key.left = parseInt(editLeft.value, 10);
    key.width = parseInt(editWidth.value, 10);
    const offset = parseInt(editOffset.value, 10);
    key.offset = offset !== 0 ? offset : undefined;
    leftValue.textContent = key.left;
    widthValue.textContent = key.width;
    offsetValue.textContent = offset;
  }
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
    // Reset to UP mode when navigating (new key won't be pressed)
    setEditingPressed(false);
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

// Property selection for keyboard nudging
function selectProperty(prop) {
  selectedProperty = prop;
  // Update visual selection
  leftLabel.classList.toggle('selected', prop === 'left');
  widthLabel.classList.toggle('selected', prop === 'width');
  offsetLabel.classList.toggle('selected', prop === 'offset');
}

function clearPropertySelection() {
  selectedProperty = null;
  leftLabel.classList.remove('selected');
  widthLabel.classList.remove('selected');
  offsetLabel.classList.remove('selected');
}

function nudgeSelectedProperty(delta) {
  if (!selectedProperty || editingNote === null) return;

  let input, min, max;
  switch (selectedProperty) {
    case 'left':
      input = editLeft;
      break;
    case 'width':
      input = editWidth;
      break;
    case 'offset':
      if (editOffset.disabled) return;  // Can't nudge disabled offset
      input = editOffset;
      break;
    default:
      return;
  }

  min = parseInt(input.min, 10);
  max = parseInt(input.max, 10);
  const currentValue = parseInt(input.value, 10);
  const newValue = Math.max(min, Math.min(max, currentValue + delta));

  if (newValue !== currentValue) {
    input.value = newValue;
    updateKeyFromInputs();
  }
}

// Label click handlers
leftLabel.addEventListener('click', () => selectProperty('left'));
widthLabel.addEventListener('click', () => selectProperty('width'));
offsetLabel.addEventListener('click', () => selectProperty('offset'));

// Keyboard handler for nudging
document.addEventListener('keydown', (e) => {
  if (!config?.editMode || !selectedProperty) return;

  // Arrow keys for nudging
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const multiplier = e.shiftKey ? 10 : 1;
    nudgeSelectedProperty(direction * multiplier);
  }

  // Escape to clear selection
  if (e.key === 'Escape') {
    clearPropertySelection();
  }
});

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
