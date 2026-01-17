# Interactive Sky Map Game

An interactive 3D celestial sphere application for learning astronomical coordinates and finding celestial objects. Built with Three.js and real astronomical data.

## Features

- **3D Spherical Sky Map**: Navigate inside a celestial sphere with proper astronomical coordinates (RA/Dec)
- **Real Astronomical Data**:
  - 117,931 stars from the HYG Database
  - 1,701 deep sky objects from OpenNGC
  - 160 constellations with proper star connections
  - Real-time planetary positions (with Astropy)
- **Interactive Navigation**:
  - Drag to rotate the view
  - Scroll to zoom in/out
  - Smooth camera controls
- **Celestial Object Images**: Real images of famous deep sky objects (M31, M42, M45, etc.) appear when zoomed in
- **Coordinate Grid**: RA/Dec grid lines that adjust with zoom level
- **Magnitude Filtering**: Choose which objects to display based on brightness
- **Difficulty Levels**:
  - Level 1: Constellations only
  - Level 2: Bright objects only (magnitude < 4)
  - Level 3: Custom magnitude limit
- **Game Mode**: Test your knowledge by finding named celestial objects
- **Observer Location**: Set your Earth coordinates to see horizon lines
- **Real-time Updates**: Calculate positions for any location and time

## Project Structure

```
skymap/
├── data/                           # Astronomical data (generated)
│   ├── stars.json                  # 117K stars from HYG
│   ├── constellations.json         # Constellation line data
│   ├── deep_sky_objects.json       # NGC/IC/Messier objects
│   ├── named_objects.json          # Index of named stars
│   └── transformed_sky.json        # Observer-transformed coordinates
├── data_pipeline.py                # Download and process astronomical catalogs
├── coordinate_transform.py         # Real-time coordinate transformation
├── requirements.txt                # Python dependencies
├── app.html                        # Main application HTML
├── skymap.js                       # Three.js application code
├── index.html                      # Simple landing page (optional)
└── README.md                       # This file
```

## Setup

### 1. Install Python Dependencies

This project uses [uv](https://github.com/astral-sh/uv) for fast Python dependency management.

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install all dependencies (creates .venv and installs packages)
uv sync
```

**Alternative (using pip):**
```bash
pip install -r requirements.txt
```

Dependencies:
- `astropy>=5.0` - Astronomical coordinate transformations
- `pandas>=1.3.0` - Data processing
- `numpy>=1.21.0` - Numerical operations
- `jplephem>=2.17` - Planetary ephemerides

### 2. Download Astronomical Data

Run the data pipeline to download all catalogs:

```bash
uv run python data_pipeline.py
# Or if you have activated the venv: python3 data_pipeline.py
```

This will download and process:
- HYG Star Database v4.1 (~10MB)
- OpenNGC catalog
- Constellation line data

Output files will be created in the `data/` directory.

### 3. Open the Application

Simply open `app.html` in a modern web browser:

```bash
open app.html
```

Or use a local server:

```bash
python3 -m http.server 8000
```

Then navigate to `http://localhost:8000/app.html`

## Usage

### Navigation

- **Rotate View**: Click and drag on the celestial sphere
- **Zoom**: Use mouse wheel or pinch gesture
- **Reset View**: Click "Reset View" button

### Controls

1. **Difficulty Level**: Choose between 3 difficulty modes
   - Level 1: Only shows constellation stars
   - Level 2: Shows bright objects (mag < 4)
   - Level 3: Custom magnitude limit (use slider)

2. **Magnitude Limit**: Adjust the slider to show fainter/brighter objects
   - Lower values = only brightest objects
   - Higher values = more faint objects visible

3. **Observer Location**: Set your latitude/longitude to see horizon effects
   - Click "Set Observer Location"
   - Enter your coordinates (e.g., Paris: 48.8566, 2.3522)

4. **Game Mode**: Test your celestial object knowledge
   - Click "Start Sky Map Game"
   - Find and click on the named object shown
   - Click "Pass" to skip difficult questions
   - Game tracks score, time, and accuracy

### Info Display

The info panel shows:
- **RA**: Right Ascension (0-360°)
- **Dec**: Declination (-90 to +90°)
- **FOV**: Field of View
- **Visible**: Number of objects currently displayed

## Real-time Coordinate Transformation

To calculate positions for your specific location and time:

```bash
uv run python coordinate_transform.py \
    --lat 48.8566 \
    --lon 2.3522 \
    --magnitude 6.5 \
    --include-planets \
    --include-horizon \
    --output data/transformed_sky.json

# Or if venv is activated:
python3 coordinate_transform.py \
    --lat 48.8566 \
    --lon 2.3522 \
    --magnitude 6.5 \
    --include-planets \
    --include-horizon \
    --output data/transformed_sky.json
```

Parameters:
- `--lat`: Observer latitude in degrees
- `--lon`: Observer longitude in degrees
- `--height`: Observer height in meters (default: 0)
- `--time`: Observation time (ISO format or "now")
- `--magnitude`: Maximum magnitude to include
- `--include-planets`: Calculate planetary positions
- `--include-horizon`: Calculate horizon line in RA/Dec
- `--output`: Output JSON file path

Example output:
```
Observer Location: Lat=48.8566°, Lon=2.3522°, Height=0m
Observation Time: 2026-01-16 10:18:34.663
Magnitude Limit: 6.5

Loaded 117931 stars and 1701 deep sky objects
Filtered to 8921 stars and 122 DSOs (mag <= 6.5)
Transforming coordinates...
Visible objects: 3777 stars, 58 DSOs
Calculating planetary positions...
Visible planets: 7/9
Calculating horizon line...
Horizon line: 360 points
```

## Advanced Features

### Constellation Lines

Constellation lines are automatically loaded but currently need to be implemented in the renderer. The data structure includes:
- Constellation abbreviations (IAU standard)
- HIP star numbers defining line segments
- All 88 modern astronomical constellations

### Object Size Scaling

Objects remain white points until zoomed in enough to match their real angular size. This matches how objects appear in the night sky.

### Deep Sky Object Images

When you zoom in close enough (camera distance < 15 units), real images of famous Messier objects will fade in. Currently supported objects:
- **M31** - Andromeda Galaxy
- **M42** - Orion Nebula
- **M45** - Pleiades (Seven Sisters)
- **M1** - Crab Nebula
- **M13** - Great Globular Cluster in Hercules
- **M51** - Whirlpool Galaxy
- **M57** - Ring Nebula
- **M8** - Lagoon Nebula
- **M20** - Trifid Nebula

Images are loaded from Wikimedia Commons and appear as sprites at the correct celestial coordinates. The opacity gradually increases as you zoom in, making them appear naturally in the sky.

To add more images, edit the `imageDatabase` object in `skymap.js` and add URLs for additional Messier or NGC objects.

### Magnitude-based Brightness

Stars shine with brightness proportional to their real magnitude:
- Brighter stars (lower magnitude) = larger, more visible
- Fainter stars (higher magnitude) = smaller, dimmer

### Coordinate Grid Precision

The grid automatically adjusts precision based on zoom level:
- Zoomed out: 15° spacing
- Zoomed in: Finer grid spacing (to be implemented)

## Data Sources

- **Stars**: [HYG Database v4.1](https://github.com/astronexus/HYG-Database) (CC BY-SA 4.0)
- **Deep Sky Objects**: [OpenNGC](https://github.com/mattiaverga/OpenNGC) (CC BY-SA 4.0)
- **Constellations**: [dcf21/constellation-stick-figures](https://github.com/dcf21/constellation-stick-figures) (GPL v3+)
- **Planetary Data**: JPL DE430 Ephemeris via Astropy

## Technical Details

### Coordinate Systems

- **ICRS**: International Celestial Reference System (J2000)
  - RA: 0-360° (right ascension)
  - Dec: -90 to +90° (declination)
- **Alt/Az**: Altitude-Azimuth (observer-based)
  - Alt: 0-90° (altitude above horizon)
  - Az: 0-360° (azimuth compass direction)

### Transformations

The app uses Astropy for accurate coordinate transformations:
1. Load star positions in ICRS (RA/Dec)
2. Convert to observer's Alt/Az based on location and time
3. Filter objects below horizon (Alt < 0)
4. Render on 3D sphere using spherical coordinates

### Performance

- Stars are filtered by magnitude before rendering
- Uses Three.js BufferGeometry for efficient rendering
- Supports 100,000+ stars with smooth performance
- Automatic level-of-detail based on zoom

## Browser Compatibility

Requires a modern browser with:
- WebGL support
- ES6 JavaScript
- Three.js r128+

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Future Enhancements

Planned features:
- [ ] Render constellation lines when found in game
- [ ] Adaptive grid precision based on zoom
- [ ] Real angular size for planets
- [ ] Horizon line rendering
- [ ] Search function for celestial objects
- [ ] Time controls (fast-forward, rewind)
- [ ] Mobile app packaging (Cordova/Capacitor)
- [ ] Offline mode with cached data
- [ ] Multiple cultural constellation systems
- [ ] Satellite tracking (ISS, Starlink)

## License

This project uses data from multiple sources:
- Application code: MIT License
- HYG Database: CC BY-SA 4.0
- OpenNGC: CC BY-SA 4.0
- Constellation data: GPL v3+

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Consult Astropy documentation for coordinate questions

## Acknowledgments

- [Three.js](https://threejs.org/) - 3D graphics library
- [Astropy](https://www.astropy.org/) - Astronomy tools
- [HYG Database](https://github.com/astronexus/HYG-Database) - Star catalog
- [OpenNGC](https://github.com/mattiaverga/OpenNGC) - Deep sky objects
- IAU - Standard constellation boundaries
