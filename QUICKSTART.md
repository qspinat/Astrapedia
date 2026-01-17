# Quick Start Guide

## Fixed Issues

### Loading Problem
✅ **Fixed**: The app was trying to load a 22MB star database which caused slow loading or timeouts.

**Solution**: Created optimized data files:
- `stars_bright.json` (1.7 MB) - Default, loads quickly
- `stars_medium.json` (7.7 MB) - More stars
- `stars_all.json` (22 MB) - Complete dataset

The app now loads the smaller `stars_bright.json` by default, containing 8,921 stars visible to the naked eye (magnitude ≤ 6.5).

### Added Features
✅ **New**: Celestial object images appear when zoomed in
- 9 famous Messier objects have real images
- Images fade in when camera distance < 15 units
- Includes Andromeda Galaxy, Orion Nebula, Pleiades, and more

## How to Run

### Option 1: Local Server (Recommended)
```bash
# Start server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000/app.html
```

### Option 2: Direct File Access
```bash
# May have CORS issues with some browsers
open app.html
```

## How to Use

### Navigation
1. **Rotate**: Click and drag anywhere on the sky
2. **Zoom In**: Scroll up or pinch in
3. **Zoom Out**: Scroll down or pinch out
4. **Reset**: Click "Reset View" button

### Finding Objects
1. Look at the **Info Panel** (top left) to see current RA/Dec coordinates
2. Visible star count shows how many objects are currently displayed
3. Adjust **Magnitude Limit** slider to see more/fewer stars

### Viewing Deep Sky Object Images
1. Zoom in by scrolling
2. When camera distance < 15, images will start appearing
3. Navigate to famous objects:
   - M31 (Andromeda) - RA: 10.68°, Dec: 41.27°
   - M42 (Orion Nebula) - RA: 83.82°, Dec: -5.39°
   - M45 (Pleiades) - RA: 56.75°, Dec: 24.12°

### Playing the Game
1. Click **"Start Sky Map Game"**
2. A named star will be shown (e.g., "Sirius", "Vega")
3. Find and click on it in the sky
4. Click **"Pass"** if you can't find it (will be asked again later)
5. Track your score and time

### Difficulty Levels
- **Level 1**: Constellations only (brightest stars)
- **Level 2**: Bright objects (magnitude < 4)
- **Level 3**: Custom magnitude (use slider)

## Current Data

The app currently displays:
- **8,921 stars** (magnitude ≤ 6.5, default)
- **160 constellations** (lines not yet rendered)
- **1,701 deep sky objects** (points only, 9 with images)
- **455 named stars** for the game

## Browser Console

Open browser console (F12 or Cmd+Option+I) to see:
- Loading progress
- Image loading status
- Any errors

You should see:
```
Starting data load...
✓ Loaded 8921 stars
✓ Loaded 160 constellations
✓ Loaded 1701 DSOs
✓ Loaded 455 named objects
All data loaded successfully!
✓ Loaded image for M31
✓ Loaded image for M42
...
```

## Performance Tips

1. **Start with default magnitude (6.5)** for best performance
2. **Use lower magnitude** (4.0) if experiencing lag
3. **Increase magnitude** (8-12) for more detail when zoomed in
4. **Close other tabs** if performance is slow

## Troubleshooting

### App won't load
- Check browser console for errors
- Make sure you're using http://localhost:8000 not file://
- Verify data files exist in `data/` directory

### Images not appearing
- Zoom in more (camera distance must be < 15)
- Check console for image loading errors
- Images only appear for 9 Messier objects

### No stars visible
- Increase magnitude limit slider
- Check "Visible" count in Info Panel
- Try resetting view

### Slow performance
- Reduce magnitude limit
- Close other browser tabs
- Use Chrome or Firefox for best performance

## Next Steps

See README.md for:
- Complete feature list
- Python coordinate transformation
- Adding more object images
- Advanced usage

## Files Overview

```
app.html              - Main application
skymap.js            - Three.js code with all logic
data/
  ├── stars_bright.json      - 8.9K stars (default, 1.7 MB)
  ├── stars_medium.json      - 41K stars (7.7 MB)
  ├── stars_all.json         - 118K stars (22 MB)
  ├── constellations.json    - Constellation lines
  ├── deep_sky_objects.json  - 1.7K DSOs
  └── named_objects.json     - 455 named stars
```

## Contributing

To add more celestial object images:

1. Find image URL (Wikimedia Commons, ESA, NASA)
2. Edit `skymap.js`
3. Add to `imageDatabase` object:
```javascript
const imageDatabase = {
    'M31': 'https://...',
    'M42': 'https://...',
    'M99': 'https://your-new-image-url.jpg',  // Add here
};
```

Images should be:
- 320px wide (for performance)
- JPG or PNG format
- Public domain or CC license
