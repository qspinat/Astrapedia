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
