/**
 * @fileoverview Tests for TypeMappings module.
 */

import {DSO_TYPE_NAMES, getDsoTypeName} from '../modules/core/TypeMappings.js';

describe('TypeMappings', () => {
  describe('DSO_TYPE_NAMES', () => {
    it('contains expected galaxy type', () => {
      expect(DSO_TYPE_NAMES['G']).toBe('Galaxy');
    });

    it('contains expected nebula types', () => {
      expect(DSO_TYPE_NAMES['PN']).toBe('Planetary Nebula');
      expect(DSO_TYPE_NAMES['Neb']).toBe('Nebula');
      expect(DSO_TYPE_NAMES['EmN']).toBe('Emission Nebula');
    });

    it('contains expected cluster types', () => {
      expect(DSO_TYPE_NAMES['GCl']).toBe('Globular Cluster');
      expect(DSO_TYPE_NAMES['OCl']).toBe('Open Cluster');
    });

    it('contains star types', () => {
      expect(DSO_TYPE_NAMES['*']).toBe('Star');
      expect(DSO_TYPE_NAMES['**']).toBe('Double Star');
    });

    it('contains solar system types', () => {
      expect(DSO_TYPE_NAMES['Planet']).toBe('Planet');
      expect(DSO_TYPE_NAMES['Moon']).toBe('Moon');
    });
  });

  describe('getDsoTypeName', () => {
    it('returns full name for known type', () => {
      expect(getDsoTypeName('G')).toBe('Galaxy');
      expect(getDsoTypeName('PN')).toBe('Planetary Nebula');
    });

    it('returns original type for unknown type', () => {
      expect(getDsoTypeName('UnknownType')).toBe('UnknownType');
    });

    it('returns "Unknown" for null or undefined', () => {
      expect(getDsoTypeName(null)).toBe('Unknown');
      expect(getDsoTypeName(undefined)).toBe('Unknown');
    });

    it('returns "Unknown" for empty string', () => {
      expect(getDsoTypeName('')).toBe('Unknown');
    });
  });
});
