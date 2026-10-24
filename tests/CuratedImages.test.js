/**
 * @fileoverview Tests for curated image lookup.
 */

import {getCuratedImage, CURATED_IMAGES, parseCatalogDesignation} from '../modules/data/CuratedImages.js';

describe('getCuratedImage', () => {
  test('matches a curated key directly', () => {
    expect(getCuratedImage('M31')).toBe(CURATED_IMAGES['M31']);
  });

  test('tolerates a separating space, as CLAUDE.md documents', () => {
    expect(getCuratedImage('M 31')).toBe(CURATED_IMAGES['M31']);
  });

  test('tolerates leading zeros', () => {
    expect(getCuratedImage('NGC0869')).toBe(CURATED_IMAGES['NGC869']);
    expect(getCuratedImage('M031')).toBe(CURATED_IMAGES['M31']);
  });

  test('is case-insensitive', () => {
    expect(getCuratedImage('m31')).toBe(CURATED_IMAGES['M31']);
  });

  test('trims surrounding whitespace', () => {
    expect(getCuratedImage('  M31  ')).toBe(CURATED_IMAGES['M31']);
  });

  test('returns null for an object with no curated image', () => {
    expect(getCuratedImage('NGC99999')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(getCuratedImage('')).toBeNull();
    expect(getCuratedImage(null)).toBeNull();
  });

  // A designation embedded in a longer name is a different object. The
  // patterns are anchored so a name that merely contains "M31" cannot take
  // Andromeda's photograph — which matters most for dynamically loaded
  // objects, whose names come from VizieR rather than the bundled catalog.
  test('does not match a designation embedded in another name', () => {
    expect(getCuratedImage('xM31')).toBeNull();
    expect(getCuratedImage('Cr399M31')).toBeNull();
    expect(getCuratedImage('M31x')).toBeNull();
  });

  test('does not match a bare prefix', () => {
    expect(getCuratedImage('M')).toBeNull();
    expect(getCuratedImage('NGC')).toBeNull();
  });

  // Three entries are {url: null}, meaning "no curated image exists, fall
  // through to the sky survey". They must resolve, not read as absent.
  test('returns the null-url sentinels rather than null', () => {
    for (const key of ['NGC869', 'NGC884', 'IC4665']) {
      const entry = getCuratedImage(key);
      expect(entry).not.toBeNull();
      expect(entry.url).toBeNull();
    }
  });
});

describe('parseCatalogDesignation', () => {
  test.each([
    ['M31', {prefix: 'M', number: 31}],
    ['M 31', {prefix: 'M', number: 31}],
    ['NGC0869', {prefix: 'NGC', number: 869}],
    ['ic 434', {prefix: 'IC', number: 434}],
  ])('parses %p', (name, expected) => {
    expect(parseCatalogDesignation(name)).toEqual(expected);
  });

  test.each(['Cr399M31', 'Orion Nebula', '', null])('rejects %p', (name) => {
    expect(parseCatalogDesignation(name)).toBeNull();
  });
});
