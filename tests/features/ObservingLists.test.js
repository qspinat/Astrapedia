/**
 * @jest-environment jsdom
 * @fileoverview Tests for the want-to-see and seen lists.
 */

import {ObservingLists} from '../../modules/features/ObservingLists.js';

describe('ObservingLists', () => {
  beforeEach(() => localStorage.clear());

  test('adds and removes a wanted object', () => {
    const lists = new ObservingLists();
    expect(lists.toggleWanted('M42')).toBe(true);
    expect(lists.isWanted('M42')).toBe(true);
    expect(lists.toggleWanted('M42')).toBe(false);
  });

  test('records the date an object was seen', () => {
    const lists = new ObservingLists();
    lists.toggleSeen('M31', new Date('2026-12-21T21:00:00Z'));
    expect(lists.seenOn('M31').toISOString()).toBe('2026-12-21T21:00:00.000Z');
    expect(lists.seenOn('M33')).toBeNull();
  });

  test('keeps the lists across restarts', () => {
    new ObservingLists().toggleWanted('M13');
    expect(new ObservingLists().getWanted()).toEqual(['M13']);
  });

  test('lists wanted objects in the order they were added', () => {
    const lists = new ObservingLists();
    lists.toggleWanted('M51');
    lists.toggleWanted('M1');
    expect(lists.getWanted()).toEqual(['M51', 'M1']);
  });

  test('ignores corrupt stored data', () => {
    localStorage.setItem('astrapedia_observing_lists', JSON.stringify({wanted: [1, 2]}));
    expect(new ObservingLists().getWanted()).toEqual([]);
  });

  test('does not mistake built-in names for list entries', () => {
    expect(new ObservingLists().isWanted('toString')).toBe(false);
  });
});
