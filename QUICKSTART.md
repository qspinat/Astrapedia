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
- Fast forward or rewind
- Jump to a specific date/time
- Return to "Now"

### Guided Tours
Open Settings and select a tour:
- **Tonight**: Objects visible from your location
- **Messier**: All 110 Messier objects
- **Nebulae/Galaxies/Clusters**: By object type
- **Constellations**: Learn all 88 constellations

### Game Mode
1. Click the Play button
2. Choose a category (constellations, Messier objects, bright stars, etc.)
3. Find and click the target object shown
4. Track your score and accuracy

## Display Settings

- **Magnitude slider**: Show more (higher) or fewer (lower) stars
- **Constellation lines**: Toggle on/off
- **Light pollution**: Adjust to match your sky conditions
- **Language**: Constellation names in 8 languages

## Data Files

The app loads different star files based on your needs:
- `stars_bright.json` (mag 6.5) - Naked eye stars, fastest loading
- `stars_medium.json` (mag 8.0) - Default, good balance
- `stars_all.json` (mag 12.0) - All stars, for deep exploration

## Troubleshooting

**App won't load**: Use `http://localhost:8000` not `file://`

**Slow performance**: Lower the magnitude limit or reduce "Max Dynamic Objects" in Settings

**No location features**: Allow location access when prompted, or set location manually in Settings

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/pause time |
| `R` | Reset view |
| `Esc` | Close panels |
