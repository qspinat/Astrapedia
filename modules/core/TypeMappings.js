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
  'G': 'Galaxy',
  'GClstr': 'Galaxy Cluster',
  'GPair': 'Galaxy Pair',
  'GTrpl': 'Galaxy Triplet',
  'GGroup': 'Galaxy Group',
  'PN': 'Planetary Nebula',
  'HII': 'HII Region',
  'EmN': 'Emission Nebula',
  'RfN': 'Reflection Nebula',
  'SNR': 'Supernova Remnant',
  'Nova': 'Nova Remnant',
  'NonEx': 'Non-Existent',
  'Neb': 'Nebula',
  'Cl+N': 'Cluster with Nebulosity',
  'GCl': 'Globular Cluster',
  'OCl': 'Open Cluster',
  'Star': 'Star',
  'DrkN': 'Dark Nebula',
  'Other': 'Other',
  'Dup': 'Duplicate',
  '*': 'Star',
  '**': 'Double Star',
  '*Ass': 'Star Association',
  'Planet': 'Planet',
  'Moon': 'Moon',
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
