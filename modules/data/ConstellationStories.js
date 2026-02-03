/**
 * @fileoverview Constellation mythology and viewing information.
 * Contains stories, best viewing times, and notable objects for each constellation.
 */

/**
 * Constellation stories and metadata.
 * Keys are IAU constellation abbreviations.
 * @type {!Object<string, !Object>}
 */
export const CONSTELLATION_STORIES = {
  'Ori': {
    mythology: 'Orion was a giant huntsman in Greek mythology, placed among the stars by Zeus. He is depicted hunting with his club and shield.',
    bestSeen: 'Winter (Northern Hemisphere)',
    brightestStar: 'Rigel',
    notableObjects: ['M42 (Orion Nebula)', 'Horsehead Nebula'],
  },
  'UMa': {
    mythology: 'Ursa Major, the Great Bear, was once the nymph Callisto who was transformed into a bear by Zeus\' jealous wife Hera.',
    bestSeen: 'Spring (Northern Hemisphere)',
    brightestStar: 'Alioth',
    notableObjects: ['The Big Dipper asterism', 'M81 & M82 galaxies'],
  },
  'Cas': {
    mythology: 'Cassiopeia was a vain queen in Greek mythology who boasted about her beauty, angering the sea gods.',
    bestSeen: 'Autumn (Northern Hemisphere)',
    brightestStar: 'Schedar',
    notableObjects: ['M52 open cluster', 'NGC 7789'],
  },
  'Cyg': {
    mythology: 'Cygnus represents several swans in Greek mythology, most commonly Zeus in disguise visiting Leda.',
    bestSeen: 'Summer (Northern Hemisphere)',
    brightestStar: 'Deneb',
    notableObjects: ['North America Nebula', 'Veil Nebula'],
  },
  'Sco': {
    mythology: 'Scorpius is the scorpion that killed Orion according to Greek mythology, which is why they are on opposite sides of the sky.',
    bestSeen: 'Summer (Northern Hemisphere)',
    brightestStar: 'Antares',
    notableObjects: ['M4 globular cluster', 'M7 open cluster'],
  },
  'Leo': {
    mythology: 'Leo represents the Nemean Lion slain by Hercules as his first labor. The lion\'s hide was impervious to weapons.',
    bestSeen: 'Spring (Northern Hemisphere)',
    brightestStar: 'Regulus',
    notableObjects: ['Leo Triplet (M65, M66, NGC 3628)'],
  },
  'Sgr': {
    mythology: 'Sagittarius is often depicted as a centaur archer. It lies in the direction of the center of our Milky Way galaxy.',
    bestSeen: 'Summer (Northern Hemisphere)',
    brightestStar: 'Kaus Australis',
    notableObjects: ['Lagoon Nebula (M8)', 'Trifid Nebula (M20)'],
  },
  'And': {
    mythology: 'Andromeda was an Ethiopian princess chained to a rock as sacrifice to a sea monster, rescued by Perseus.',
    bestSeen: 'Autumn (Northern Hemisphere)',
    brightestStar: 'Alpheratz',
    notableObjects: ['Andromeda Galaxy (M31)'],
  },
  'Per': {
    mythology: 'Perseus was a Greek hero who slew Medusa and rescued Andromeda. He is depicted holding Medusa\'s head.',
    bestSeen: 'Autumn/Winter (Northern Hemisphere)',
    brightestStar: 'Mirfak',
    notableObjects: ['Double Cluster (NGC 869/884)', 'Perseid meteor shower radiant'],
  },
  'Tau': {
    mythology: 'Taurus represents the bull form Zeus took to abduct Europa. The bright star Aldebaran marks the bull\'s eye.',
    bestSeen: 'Winter (Northern Hemisphere)',
    brightestStar: 'Aldebaran',
    notableObjects: ['Pleiades (M45)', 'Hyades', 'Crab Nebula (M1)'],
  },
  'Gem': {
    mythology: 'Gemini represents the twins Castor and Pollux from Greek mythology, inseparable brothers placed in the sky by Zeus.',
    bestSeen: 'Winter (Northern Hemisphere)',
    brightestStar: 'Pollux',
    notableObjects: ['Eskimo Nebula', 'Geminid meteor shower radiant'],
  },
  'Vir': {
    mythology: 'Virgo is often associated with Demeter, goddess of the harvest, or her daughter Persephone.',
    bestSeen: 'Spring (Northern Hemisphere)',
    brightestStar: 'Spica',
    notableObjects: ['Virgo Cluster of galaxies', 'Sombrero Galaxy (M104)'],
  },
  'Aql': {
    mythology: 'Aquila is the eagle that carried Zeus\'s thunderbolts. Its brightest star Altair forms the Summer Triangle.',
    bestSeen: 'Summer (Northern Hemisphere)',
    brightestStar: 'Altair',
    notableObjects: ['Part of Summer Triangle'],
  },
  'Lyr': {
    mythology: 'Lyra represents the lyre of Orpheus, whose music could charm all living things. Vega is one of the brightest stars in the sky.',
    bestSeen: 'Summer (Northern Hemisphere)',
    brightestStar: 'Vega',
    notableObjects: ['Ring Nebula (M57)', 'Part of Summer Triangle'],
  },
  'CMa': {
    mythology: 'Canis Major is one of Orion\'s hunting dogs. Sirius, the Dog Star, is the brightest star in the night sky.',
    bestSeen: 'Winter (Northern Hemisphere)',
    brightestStar: 'Sirius',
    notableObjects: ['M41 open cluster'],
  },
  'UMi': {
    mythology: 'Ursa Minor, the Little Bear, contains Polaris (the North Star) at the tip of its tail, used for navigation for millennia.',
    bestSeen: 'Year-round (Northern Hemisphere)',
    brightestStar: 'Polaris',
    notableObjects: ['Polaris (North Star)'],
  },
  'Cen': {
    mythology: 'Centaurus represents Chiron, the wise centaur who tutored many Greek heroes. It contains the closest star system to Earth.',
    bestSeen: 'Autumn (Southern Hemisphere)',
    brightestStar: 'Alpha Centauri',
    notableObjects: ['Alpha Centauri system', 'Omega Centauri globular cluster'],
  },
  'Cru': {
    mythology: 'Crux, the Southern Cross, is the smallest constellation but highly prominent in the southern sky, used for navigation.',
    bestSeen: 'Autumn (Southern Hemisphere)',
    brightestStar: 'Acrux',
    notableObjects: ['Jewel Box cluster', 'Coalsack Nebula'],
  },
};

/**
 * Get constellation story by abbreviation.
 * @param {string} abbrev - IAU constellation abbreviation
 * @returns {?Object} Story object or null if not found
 */
export function getConstellationStory(abbrev) {
  return CONSTELLATION_STORIES[abbrev] || null;
}

/**
 * Check if a constellation has story data.
 * @param {string} abbrev - IAU constellation abbreviation
 * @returns {boolean} True if story exists
 */
export function hasConstellationStory(abbrev) {
  return abbrev in CONSTELLATION_STORIES;
}
