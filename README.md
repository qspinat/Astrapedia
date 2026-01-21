# Interactive Sky Map

An interactive 3D celestial sphere application for learning astronomical coordinates and finding celestial objects. Built with Three.js and real astronomical data.

## Features

- **3D Spherical Sky Map**: Navigate inside a celestial sphere with proper astronomical coordinates (RA/Dec)
- **Real Astronomical Data**:
  - 117,931 stars from the HYG Database
  - 1,701 deep sky objects from OpenNGC
  - 88 constellations with proper star connections
  - Real-time planetary positions (via Astropy/JPL ephemeris)
- **Interactive Navigation**:
  - Drag to rotate the view
  - Scroll to zoom in/out
  - Smooth camera controls
- **Search**: Find any star, constellation, or deep sky object with fuzzy matching
- **Celestial Object Images**: Real images from ESA/Hubble, NASA, and Wikimedia appear when zoomed in
- **Guided Tours**: Explore Messier objects, constellations, or tonight's best objects
- **Game Mode**: Test your knowledge by finding named celestial objects (10 difficulty categories)
- **Time Controls**: Simulate the sky at any date/time with play/pause and speed controls
- **Telescope Simulation**: Configure virtual telescope and eyepiece to see realistic field of view and limiting magnitude
- **Observer Location**: Set your Earth coordinates to see horizon and altitude/azimuth grid
- **Multi-language**: Constellation names in 8 languages (en, la, fr, de, es, ja, zh, ar)
- **Dynamic Loading**: Fetches additional faint stars from VizieR when zoomed in
- **Android App**: Build native Android APK via Capacitor

## Quick Start

### 1. Install Dependencies

```bash
# Install uv for Python (if needed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Python and Node.js dependencies
uv sync
npm install
```

### 2. Download Astronomical Data

```bash
uv run python data_pipeline.py
uv run python create_optimized_data.py
```

### 3. Run the Application

```bash
npm run dev
```

Then open http://localhost:8000/app.html

## Usage

### Navigation

- **Rotate View**: Click and drag on the celestial sphere
- **Zoom**: Mouse wheel or pinch gesture
- **Reset View**: Click the reset button or double-click

### Controls

- **Search**: Type any object name (M31, Vega, Orion, NGC 7293)
- **Magnitude Limit**: Adjust slider to show fainter/brighter objects
- **Time**: Use time controls to see the sky at different dates
- **Location**: Set observer coordinates for accurate horizon display
- **Telescope Mode**: Configure aperture, focal length, and eyepiece to simulate telescope views

### Game Mode

- Select a difficulty category (Messier, bright stars, constellations, etc.)
- Find and click on the target object shown
- Track your score, time, and accuracy

### Guided Tours

- **Messier Marathon**: Visit all 110 Messier objects
- **Constellation Tour**: Learn the 88 modern constellations
- **Tonight's Best**: Objects visible from your location tonight

## Project Structure

```
skymap/
├── app.html                    # Main application HTML
├── main.js                     # Application entry point
├── modules/                    # ES6 modules
│   ├── core/                   # Core utilities (EventBus, Constants, CoordinateUtils)
│   ├── services/               # Data loading, image fetching, geolocation
│   ├── features/               # Game, search, tours, time, telescope
│   ├── ui/                     # UI controllers and panel management
│   └── data/                   # Curated image database
├── data/                       # Generated astronomical data (JSON)
├── skymap/                     # Python package for data processing
├── data_pipeline.py            # Download and process catalogs
├── create_optimized_data.py    # Create magnitude-filtered star files
└── coordinate_transform.py     # Observer-specific coordinate transformation
```

## Data Pipeline

### Download and Process Catalogs

```bash
uv run python data_pipeline.py
```

Downloads and processes:
- HYG Star Database v4.1 (117K stars)
- OpenNGC catalog (1.7K deep sky objects)
- IAU constellation line data

### Create Optimized Files

```bash
uv run python create_optimized_data.py
```

Creates magnitude-filtered star files:
- `stars_bright.json` (mag ≤ 6.5) - naked eye stars
- `stars_medium.json` (mag ≤ 8.0) - binocular stars
- `stars_all.json` (mag ≤ 12.0) - telescope stars

### Observer-Specific Transformation

```bash
uv run python coordinate_transform.py \
    --lat 48.8566 --lon 2.3522 \
    --magnitude 6.5 \
    --include-planets \
    --include-horizon
```

## Android Build

Requires Java 21:

```bash
brew install openjdk@21  # macOS
npm run build:android
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Testing

```bash
# JavaScript tests
npm test
npm test -- tests/EventBus.test.js  # Single file

# Python tests
uv run pytest
uv run pytest tests/python/test_astronomy.py  # Single file
```

## Data Sources

- **Stars**: [HYG Database v4.1](https://github.com/astronexus/HYG-Database) (CC BY-SA 4.0)
- **Deep Sky Objects**: [OpenNGC](https://github.com/mattiaverga/OpenNGC) (CC BY-SA 4.0)
- **Constellations**: [dcf21/constellation-stick-figures](https://github.com/dcf21/constellation-stick-figures) (GPL v3+)
- **Planetary Data**: JPL DE430 Ephemeris via Astropy
- **Images**: ESA/Hubble, NASA, Wikimedia Commons (various CC licenses)

## Browser Compatibility

Requires a modern browser with WebGL and ES6 support:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

- Application code: MIT License
- HYG Database: CC BY-SA 4.0
- OpenNGC: CC BY-SA 4.0
- Constellation data: GPL v3+

## Acknowledgments

- [Three.js](https://threejs.org/) - 3D graphics library
- [Astropy](https://www.astropy.org/) - Astronomy tools
- [HYG Database](https://github.com/astronexus/HYG-Database) - Star catalog
- [OpenNGC](https://github.com/mattiaverga/OpenNGC) - Deep sky objects
- IAU - Standard constellation boundaries
