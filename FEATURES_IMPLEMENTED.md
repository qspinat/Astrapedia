# Features Implemented

## Summary

The sky map has been transformed from a basic viewer into a comprehensive astronomy application inspired by Stellarium and Star Walk 2. The codebase has been fully modularized using an EventBus architecture for decoupled communication between components.

**Architecture:**
- `skymap.js`: ~2,048 lines - Main application class (Three.js scene, orchestration)
- `main.js`: ~373 lines - Application entry point, module wiring
- `app.html`: ~535 lines - UI structure with CSP headers
- `modules/`: 40+ ES6 modules organized by category

---

## Core Features

### Constellation Lines
- Renders constellation stick figures connecting stars
- Uses IAU standard constellation data (88 constellations)
- Toggleable visibility
- Highlight on selection with configurable colors

**Module:** `modules/rendering/ConstellationRenderer.js`

---

### Star Colors by Spectral Type
- Stars display realistic colors based on temperature
- Blue stars (O/B type), White (A/F), Yellow (G), Orange (K), Red (M)
- Uses color index (B-V) from HYG database for accuracy

**Module:** `modules/rendering/StarFieldRenderer.js`

---

### Search Function
- Search for stars, galaxies, nebulae, and other objects
- Autocomplete suggestions as you type
- Results sorted by brightness
- Click result to navigate and show info
- Searchable: Named stars, Messier objects, bright NGC/IC objects, planets, constellations

**Module:** `modules/features/SearchManager.js`

---

### Object Information Panel
- Slide-in panel showing object details
- Displays name, type, coordinates, magnitude
- Shows constellation information and mythology
- Fetches real images from ESA/Hubble, NASA, Wikimedia

**Module:** `modules/features/SelectionManager.js`

---

### Time Machine Controls
- Speed controls: 1x (real-time), 100x, 1000x
- Play/Pause button
- Jump to specific date/time
- "Now" button to reset to current time
- Celestial rotation and planetary positions update with time

**Modules:** `modules/features/TimeController.js`, `modules/features/TimeUI.js`

---

### Visible Tonight
- Shows list of bright stars and objects currently visible
- Filters by altitude above horizon
- Sorted by brightness
- Click object name to navigate

**Module:** `modules/features/VisibilityCalculator.js`

---

### Atmosphere & Sky Conditions
- Changes sky color based on time of day
- Fades stars during daytime
- Dawn/dusk twilight colors
- Light pollution simulation

**Module:** `modules/features/SkyConditionsHandler.js`

---

### Touch Gestures & Input
- Pinch to zoom
- Drag to rotate
- Double-tap to select
- Smooth inertia scrolling

**Module:** `modules/interaction/InputController.js`

---

### Compass Mode (Device Orientation)
- Use device sensors to match real sky
- Toggle between compass lock and free exploration
- Calibration support

**Module:** `modules/interaction/CompassController.js`

---

### Location Services
- Auto-detect user's geographic location via browser API
- Manual coordinate entry
- Stores location for accurate horizon display
- City name lookup

**Module:** `modules/services/LocationManager.js`

---

### Constellation Stories
- Displays mythology and facts about constellations
- Best viewing season, notable objects
- Multi-language support (8 languages)

**Modules:** `modules/data/ConstellationStories.js`, `modules/data/ConstellationNames.js`

---

### Object Tours
- Guided tours of the night sky
- Step-by-step navigation to interesting objects
- Multiple tour types: Messier Marathon, Constellation Tour, Tonight's Best
- Visual highlighting of tour targets

**Modules:** `modules/features/TourController.js`, `modules/features/TourUI.js`, `modules/rendering/TourHighlight.js`

---

### Astronomical Events Calendar
- Shows upcoming astronomical events
- Meteor showers, eclipses, conjunctions, solstices
- Days until each event
- Event details and viewing tips

**Module:** `modules/features/EventsCalendar.js`

---

### Game Mode
- 10 difficulty categories (Messier, bright stars, constellations, etc.)
- Find and click on target objects
- Score tracking with time and accuracy
- Progressive difficulty

**Modules:** `modules/features/GameController.js`, `modules/features/GameUI.js`

---

### Telescope Simulation
- Configure virtual telescope aperture, focal length
- Eyepiece selection with apparent FOV
- Calculates magnification, exit pupil, real FOV
- Limiting magnitude based on aperture

**Modules:** `modules/features/TelescopeController.js`, `modules/features/TelescopeUI.js`

---

### Dynamic Star/DSO Loading
- Fetches additional faint stars from VizieR (Tycho-2, UCAC4) when zoomed
- Loads DSOs from SIMBAD
- Configurable limits (30K stars, 5K DSOs)
- Automatic cleanup when zooming out

**Modules:** `modules/services/DynamicDataLoader.js`, `modules/rendering/DynamicObjectManager.js`

---

### Celestial Object Images
- Real images from ESA/Hubble, NASA Webb, Wikimedia Commons
- Priority: Curated images > NASA API > Wikimedia > CDS HiPS DSS
- Images appear when zoomed in (50% screen coverage)
- Fade out when too zoomed

**Modules:** `modules/services/ImageFetcher.js`, `modules/rendering/ImageRenderer.js`, `modules/data/CuratedImages.js`

---

### Planet Rendering
- Real-time planetary positions via solar system calculations
- Planet sprites with real images
- Accurate orbital mechanics

**Modules:** `modules/rendering/PlanetRenderer.js`, `modules/astronomy/SolarSystem.js`, `modules/data/PlanetImages.js`

---

### Grid Overlays
- RA/Dec equatorial grid
- Alt/Az horizon grid
- Toggleable visibility
- Cardinal direction labels (N/S/E/W)

**Modules:** `modules/rendering/GridRenderer.js`, `modules/rendering/HorizonRenderer.js`

---

## Architecture

### Module Categories

```
modules/
├── core/           # EventBus, Constants, CoordinateUtils, Utils, ErrorHandler
├── services/       # DataLoader, DynamicDataLoader, ImageFetcher, LocationManager
├── features/       # Game, Search, Tours, Time, Telescope, Selection, Events
├── rendering/      # Stars, Constellations, Planets, Grids, Horizon, Images
├── interaction/    # InputController, ClickHandler, CompassController
├── ui/             # UIController, PanelManager, DOMCache, BugReportHandler
├── data/           # CuratedImages, ConstellationNames, Descriptions, PlanetImages
└── astronomy/      # SolarSystem calculations
```

### Key Patterns

1. **EventBus Communication**: Decoupled modules communicate via events
2. **Dependency Injection**: Factory functions for testable modules
3. **Singleton Services**: Pre-instantiated shared services (dataLoader, locationManager, etc.)
4. **State Ownership**: Each module owns its state; skymap.js holds only shared data
5. **DOM Caching**: Centralized DOM access via DOMCache module

### EventBus Events

- `TIME_CHANGED`, `LOCATION_CHANGED` - State updates
- `OBJECT_SELECTED`, `CONSTELLATION_SELECTED` - User interactions
- `CMD_SET_TIME_SPEED`, `CMD_JUMP_TO_TIME` - Commands
- `GAME_STARTED`, `GAME_ENDED`, `TOUR_STARTED`, `TOUR_ENDED` - Feature lifecycle

---

## Testing

```bash
# JavaScript tests (Jest with ESM)
npm test
npm test -- tests/EventBus.test.js

# Python tests (pytest)
uv run pytest
uv run pytest tests/python/test_astronomy.py
```

---

## Credits

Features inspired by:
- **Stellarium** - Time controls, search function, object details, telescope simulation
- **Star Walk 2** - UI/UX, constellation stories, visible tonight, tours
