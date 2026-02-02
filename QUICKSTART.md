# Quick Start Guide

## Running the App

```bash
# Start local server
npm run dev

# Open in browser
open http://localhost:8000/app.html
```

## Navigation

| Action | Mouse | Touch |
|--------|-------|-------|
| Rotate view | Click + drag | One finger drag |
| Zoom in/out | Scroll wheel | Pinch |
| Select object | Click | Tap |
| Reset view | Double-click | Double-tap |

## Finding Objects

**Search**: Type in the search bar to find any star, constellation, or deep sky object. Supports fuzzy matching (e.g., "androm" finds Andromeda).

**Browse**: Click on any star or object to see details in the info panel.

## Key Features

### Telescope Mode
1. Open Settings (gear icon)
2. Enable "Telescope Mode"
3. Configure your telescope aperture and focal length
4. Configure your eyepiece focal length and apparent FOV
5. The view will zoom to match your telescope's real field of view

### Time Controls
Use the time controls at the bottom to:
- Play/pause time simulation
- Fast forward (100x, 1000x) or rewind
- Jump to a specific date/time
- Return to "Now"

### Compass Mode
1. Enable compass mode in Settings
2. Point your device at the sky
3. The view matches your device orientation
4. Toggle between locked and free exploration

### Guided Tours
Open Settings and select a tour:
- **Tonight's Best**: Objects visible from your location
- **Messier Marathon**: All 110 Messier objects
- **Constellation Tour**: Learn all 88 constellations
- **Nebulae/Galaxies/Clusters**: By object type

### Game Mode
1. Click the Play button
2. Choose a category (constellations, Messier objects, bright stars, etc.)
3. Find and click the target object shown
4. Track your score and accuracy

### Events Calendar
View upcoming astronomical events:
- Meteor showers (Perseids, Geminids, etc.)
- Eclipses and conjunctions
- Solstices and equinoxes

## Display Settings

| Setting | Description |
|---------|-------------|
| Magnitude slider | Show more (higher) or fewer (lower) stars |
| Constellation lines | Toggle stick figures on/off |
| Grid overlays | RA/Dec or Alt/Az coordinates |
| Light pollution | Adjust to match your sky conditions |
| Language | Constellation names in 8 languages |

## Data Files

The app loads different star files based on your needs:

| File | Stars | Magnitude | Use Case |
|------|-------|-----------|----------|
| `stars_bright.json` | 8.9K | ≤ 6.5 | Naked eye, fastest loading |
| `stars_medium.json` | 41K | ≤ 8.0 | Default, good balance |
| `stars_all.json` | 118K | ≤ 12.0 | Deep exploration |

When zoomed in, additional stars load dynamically from VizieR.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/pause time |
| `R` | Reset view |
| `Esc` | Close panels |
| `G` | Toggle grid |
| `C` | Toggle constellation lines |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't load | Use `http://localhost:8000` not `file://` |
| Slow performance | Lower magnitude limit or reduce "Max Dynamic Objects" in Settings |
| No location features | Allow location access when prompted, or set manually in Settings |
| Compass not working | Ensure device has orientation sensors and permissions are granted |
| Images not loading | Check internet connection; some images require external APIs |

## Mobile Tips

- Use landscape orientation for best experience
- Enable compass mode to match the real sky
- Pinch slowly for precise zoom control
- The app works offline after first load (PWA)
