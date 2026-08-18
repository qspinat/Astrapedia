/**
 * @fileoverview Shared type mappings for celestial objects.
 * Centralizes DSO type names and other type-related mappings.
 */

/**
 * DSO (Deep Sky Object) type full names.
 * Maps abbreviated type codes to human-readable names.
 * @const {!Object<string, string>}
 */
export const DSO_TYPE_NAMES = {
  // Stars
  '*': 'Star',
  '**': 'Double Star',
  '*Ass': 'Stellar Association',
  'Star': 'Star',

  // Galaxies
  'G': 'Galaxy',
  'GClstr': 'Galaxy Cluster',
  'GPair': 'Galaxy Pair',
  'GTrpl': 'Galaxy Triplet',
  'GGroup': 'Galaxy Group',

  // Nebulae
  'PN': 'Planetary Nebula',
  'HII': 'HII Region',
  'EmN': 'Emission Nebula',
  'RfN': 'Reflection Nebula',
  'SNR': 'Supernova Remnant',
  'Nova': 'Nova',
  'NonEx': 'Non-Existent',
  'Neb': 'Nebula',
  'Cl+N': 'Cluster with Nebulosity',
  'Dark': 'Dark Nebula',
  'DrkN': 'Dark Nebula',
  'DN': 'Dark Nebula',

  // Clusters
  'GCl': 'Globular Cluster',
  'OCl': 'Open Cluster',
  'Cl': 'Star Cluster',

  // Other
  'Ast': 'Asterism',
  'PD': 'Protoplanetary Disk',
  'QSO': 'Quasar',
  'AGN': 'Active Galactic Nucleus',
  'Other': 'Other',
  'Dup': 'Duplicate',

  // Planets and solar system
  'Planet': 'Planet',
  'planet': 'Planet',
  'Dwarf': 'Dwarf Planet',
  'Sun': 'Star (The Sun)',
  'Moon': 'Natural Satellite',
  'Constellation': 'Constellation',
};

/**
 * Get the full name for a DSO type abbreviation.
 * @param {string} type - Type abbreviation
 * @returns {string} Full type name
 */
export function getDsoTypeName(type) {
  return DSO_TYPE_NAMES[type] || type || 'Unknown';
}

/**
 * Halo tint per DSO type, as 0-255 RGB.
 *
 * Used by every module that draws a DSO halo sprite, so a dynamically loaded
 * object is tinted the same as the catalogued one next to it.
 * @const {!Object<string, !Array<number>>}
 */
const DSO_HALO_COLORS = {
  // OpenNGC codes, used by the bundled catalog.
  G: [255, 240, 200],      // Galaxy - yellowish
  PN: [180, 255, 200],     // Planetary nebula - greenish
  Neb: [255, 180, 200],    // Nebula - pinkish
  'Cl+N': [255, 180, 200],
  EmN: [255, 180, 200],
  HII: [255, 180, 200],

  // NGC2000 codes, used by the VizieR results behind dynamic loading. Same
  // objects, different vocabulary, so they must land on the same tints —
  // otherwise a dynamically loaded galaxy is a different colour from the
  // catalogued one beside it.
  Gx: [255, 240, 200],     // Galaxy
  Pl: [180, 255, 200],     // Planetary nebula
  Nb: [255, 180, 200],     // Nebula
  'C+N': [255, 180, 200],  // Cluster with nebulosity
};

/** Fallback halo tint for unrecognised types. @const {!Array<number>} */
const DEFAULT_HALO_COLOR = [200, 220, 255];  // pale blue

/**
 * Get the halo tint for a DSO type.
 *
 * Matching is exact. A substring test would be wrong here: 'GCl' (globular
 * cluster) contains 'G' and would read as a galaxy.
 *
 * @param {string|undefined} type - Catalog type code
 * @returns {!Array<number>} RGB triple in 0-255
 */
export function getDsoHaloColor(type) {
  return DSO_HALO_COLORS[type] || DEFAULT_HALO_COLOR;
}
