# Key Lights

A browser-based MIDI keyboard visualizer designed as a transparent overlay for live streaming. When you play notes on your MIDI keyboard, corresponding keys light up on screen with a customizable gradient effect.

Built specifically for use with **Ecamm Live** web widget overlays, but works with any streaming software that supports browser sources.

## Features

- **88-key piano support** - Full coverage from A0 (MIDI note 21) to C8 (note 108)
- **Transparent background** - Only active keys are visible, perfect for overlays
- **Gradient effect** - Keys fade from solid color at top to transparent at bottom
- **Sustain pedal support** - Held notes stay lit when the sustain pedal is down, shown in a lighter color
- **Particle effects** - Sparkles float upward from keys when pressed
- **Glow effect** - Soft glow around active keys for added visual impact
- **Fully customizable** - Adjust position, width, and vertical offset for each key
- **Edit mode** - Visual editor with sliders for real-time key positioning
- **4K canvas** - 3840x2160 resolution for crisp visuals

## Quick Start

1. **Clone or download** this repository

2. **Start the server**:
   ```bash
   python3 server.py
   ```

3. **Open in browser**: Navigate to `http://localhost:3000`

4. **Grant MIDI access** when prompted

5. **Add to your streaming software**:
   - In Ecamm Live: Add a Web Widget Overlay with URL `http://localhost:3000`
   - In OBS: Add a Browser Source with the same URL

## Configuration

All settings are stored in `config.json`:

### Global Settings

| Parameter | Type | Description |
|-----------|------|-------------|
| `debug` | boolean | Show/hide the MIDI debug panel |
| `editMode` | boolean | Show/hide the key position editor |
| `canvas.width` | number | Canvas width in pixels (default: 3840) |
| `canvas.height` | number | Canvas height in pixels (default: 2160) |
| `colors.active` | string | Hex color for active keys (e.g., `"#1273f8"`) |
| `colors.sustainedLighten` | number | How much to lighten sustained notes (0-1, default: 0.4) |
| `keyBounds.top` | number | Y position of the top of all keys |
| `keyBounds.bottom` | number | Y position of the bottom of all keys |

### Effects Settings

| Parameter | Type | Description |
|-----------|------|-------------|
| `effects.glow.enabled` | boolean | Enable/disable key glow effect (default: true) |
| `effects.glow.blur` | number | Blur radius for glow in pixels (default: 20) |
| `effects.glow.offsetY` | number | Vertical offset for glow (default: -5) |
| `effects.particles.enabled` | boolean | Enable/disable particle effects (default: true) |
| `effects.particles.speed` | number | Upward speed of particles (default: 4.5) |
| `effects.particles.size` | number | Base size multiplier for particles (default: 2) |
| `effects.particles.lifetime` | number | How long particles live in milliseconds (default: 2000) |
| `effects.particles.count` | number | Maximum particles spawned per keypress (default: 5) |

### Per-Key Settings

Each key in the `keys` array has:

| Parameter | Type | Description |
|-----------|------|-------------|
| `note` | number | MIDI note number (21-108) |
| `name` | string | Key name (e.g., `"C4"`, `"F#5"`) |
| `left` | number | X position of the left edge |
| `width` | number | Width of the key in pixels |
| `offset` | number | (Optional) Vertical offset from -25 to 25 |
| `color` | string | (Optional) Override color for this specific key |
| `hidden` | boolean | (Optional) Hide this key from rendering |
| `pressedLeftOffset` | number | (Optional) Horizontal adjustment when key is pressed |
| `pressedWidthOffset` | number | (Optional) Width adjustment when key is pressed |

### Example Configuration

```json
{
  "debug": false,
  "editMode": false,
  "canvas": {
    "width": 3840,
    "height": 2160
  },
  "colors": {
    "active": "#1273f8",
    "sustainedLighten": 0.4
  },
  "keyBounds": {
    "top": 1645,
    "bottom": 1905
  },
  "effects": {
    "glow": {
      "enabled": true,
      "blur": 20,
      "offsetY": -5
    },
    "particles": {
      "enabled": true,
      "speed": 4.5,
      "size": 2,
      "lifetime": 2000,
      "count": 5
    }
  },
  "keys": [
    { "note": 60, "name": "C4", "left": 1610, "width": 70 },
    { "note": 61, "name": "C#4", "left": 1660, "width": 40 },
    { "note": 62, "name": "D4", "left": 1680, "width": 70, "offset": -5 }
  ]
}
```

## Edit Mode

Enable edit mode to visually position keys:

1. Set `"editMode": true` in `config.json`
2. Refresh the browser
3. Press a key on your MIDI keyboard to select it
4. Use the sliders to adjust:
   - **Left** - Horizontal position (0 to canvas width)
   - **Width** - Key width (0 to 100)
   - **Vertical Offset** - Fine-tune vertical position (-25 to 25)
5. Click **Save** to write changes to `config.json`
6. Use **Prev/Next** buttons to navigate between keys

When finished, set `"editMode": false` to hide the editor.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML page with canvas and UI |
| `app.js` | MIDI handling, rendering, and edit mode logic |
| `config.json` | All configuration and key positions |
| `server.py` | Simple HTTP server with config save endpoint |

## Requirements

- **Browser**: Chrome, Edge, or another Chromium-based browser (required for Web MIDI API)
- **Python 3**: For running the local server
- **MIDI keyboard**: Connected via USB or Bluetooth

## Troubleshooting

### No MIDI devices detected
- Ensure your MIDI keyboard is connected before opening the page
- Try refreshing the page after connecting
- Check that no other application is using the MIDI device

### Keys not appearing
- Check the debug panel (set `"debug": true`) to see incoming MIDI messages
- Verify the note numbers match your keyboard's output
- Ensure `keyBounds.top` and `keyBounds.bottom` are within the canvas

### Changes not saving
- Make sure you're running `server.py`, not `python3 -m http.server`
- Check the debug panel for save error messages

## License

MIT License - feel free to use and modify for your streams!
