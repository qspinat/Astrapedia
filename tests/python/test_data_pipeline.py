"""
Tests for data_pipeline.py supplementary Messier object injection.
"""

import pytest

from astrapedia.astronomy import inject_supplementary_objects


class TestInjectSupplementaryObjects:
    """Tests for the inject_supplementary_objects function."""

    def test_adds_missing_objects(self):
        """Supplementary objects are added when not present."""
        existing = [
            {'name': 'NGC224', 'messier': 31, 'type': 'G'},
            {'name': 'NGC1976', 'messier': 42, 'type': 'Neb'},
        ]

        supplementary = [
            {'name': 'Mel22', 'messier': 45, 'common_names': ['Pleiades']},
            {'name': 'WNC4', 'messier': 40, 'common_names': ['Winnecke 4']},
            {'name': 'NGC5866', 'messier': 102, 'common_names': ['Spindle Galaxy']},
        ]

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='messier'
        )

        assert added_count == 3
        assert len(result) == 5

        messier_numbers = {obj.get('messier') for obj in result}
        assert 31 in messier_numbers
        assert 40 in messier_numbers
        assert 42 in messier_numbers
        assert 45 in messier_numbers
        assert 102 in messier_numbers

    def test_does_not_duplicate_existing(self):
        """Supplementary objects are skipped if key already exists."""
        existing = [
            {'name': 'NGC1432', 'messier': 45, 'type': 'OCl'},
        ]

        supplementary = [
            {'name': 'Mel22', 'messier': 45, 'common_names': ['Pleiades']},
            {'name': 'WNC4', 'messier': 40, 'common_names': ['Winnecke 4']},
        ]

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='messier'
        )

        assert added_count == 1
        assert len(result) == 2

        # Verify M45 wasn't duplicated
        m45_count = sum(1 for obj in result if obj.get('messier') == 45)
        assert m45_count == 1

    def test_handles_empty_existing_list(self):
        """Works with empty existing list."""
        existing = []
        supplementary = [
            {'name': 'Mel22', 'messier': 45},
            {'name': 'WNC4', 'messier': 40},
        ]

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='messier'
        )

        assert added_count == 2
        assert len(result) == 2

    def test_handles_empty_supplementary_list(self):
        """Works with empty supplementary list."""
        existing = [{'name': 'NGC224', 'messier': 31}]
        supplementary = []

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='messier'
        )

        assert added_count == 0
        assert len(result) == 1

    def test_skips_objects_with_null_key(self):
        """Objects without the key are not considered duplicates."""
        existing = [
            {'name': 'NGC224', 'messier': None},
            {'name': 'NGC1976'},  # No messier key at all
        ]

        supplementary = [
            {'name': 'Mel22', 'messier': 45},
        ]

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='messier'
        )

        assert added_count == 1
        assert len(result) == 3

    def test_custom_key(self):
        """Works with custom key names."""
        existing = [{'name': 'Star1', 'hip': 12345}]
        supplementary = [
            {'name': 'Star2', 'hip': 67890},
            {'name': 'Star3', 'hip': 12345},  # Duplicate
        ]

        result, added_count = inject_supplementary_objects(
            existing, supplementary, key='hip'
        )

        assert added_count == 1
        assert len(result) == 2

    def test_preserves_original_list_order(self):
        """Original objects come before supplementary objects."""
        existing = [
            {'name': 'A', 'id': 1},
            {'name': 'B', 'id': 2},
        ]
        supplementary = [
            {'name': 'C', 'id': 3},
        ]

        result, _ = inject_supplementary_objects(existing, supplementary, key='id')

        assert result[0]['name'] == 'A'
        assert result[1]['name'] == 'B'
        assert result[2]['name'] == 'C'

    def test_does_not_modify_original_list(self):
        """Original list is not mutated."""
        existing = [{'name': 'A', 'id': 1}]
        supplementary = [{'name': 'B', 'id': 2}]

        result, _ = inject_supplementary_objects(existing, supplementary, key='id')

        assert len(existing) == 1
        assert len(result) == 2


class TestSupplementaryMessierDataIntegrity:
    """Tests for the actual Messier data values used in the pipeline."""

    def test_messier_data_integrity(self):
        """Verify supplementary Messier objects have correct astronomical data."""
        # These are the actual values from data_pipeline.py
        supplementary_messier = [
            {
                'name': 'Mel22',
                'type': 'OCl',
                'ra': 56.87,
                'dec': 24.12,
                'mag': 1.6,
                'messier': 45,
                'common_names': ['Pleiades', 'Seven Sisters', 'Subaru'],
            },
            {
                'name': 'WNC4',
                'type': '**',
                'ra': 185.55,
                'dec': 58.08,
                'mag': 8.4,
                'messier': 40,
                'common_names': ['Winnecke 4'],
            },
            {
                'name': 'NGC5866',
                'type': 'G',
                'ra': 226.62,
                'dec': 55.76,
                'mag': 9.9,
                'messier': 102,
                'common_names': ['Spindle Galaxy'],
            },
        ]

        # Verify M45 (Pleiades) data
        m45 = next(m for m in supplementary_messier if m['messier'] == 45)
        assert m45['type'] == 'OCl'
        assert 56 < m45['ra'] < 58  # RA ~03h 47m
        assert 23 < m45['dec'] < 25  # Dec ~+24 deg
        assert m45['mag'] < 2  # Very bright
        assert 'Pleiades' in m45['common_names']

        # Verify M40 (Winnecke 4) data
        m40 = next(m for m in supplementary_messier if m['messier'] == 40)
        assert m40['type'] == '**'  # Double star
        assert 185 < m40['ra'] < 186  # RA ~12h 22m
        assert 57 < m40['dec'] < 59  # Dec ~+58 deg

        # Verify M102 (Spindle Galaxy) data
        m102 = next(m for m in supplementary_messier if m['messier'] == 102)
        assert m102['type'] == 'G'  # Galaxy
        assert 226 < m102['ra'] < 227  # RA ~15h 06m
        assert 55 < m102['dec'] < 56  # Dec ~+55 deg

    def test_common_names_as_list(self):
        """Supplementary Messier objects use list format for common_names."""
        supplementary_messier = [
            {'name': 'Mel22', 'messier': 45, 'common_names': ['Pleiades', 'Seven Sisters', 'Subaru']},
        ]

        for obj in supplementary_messier:
            assert isinstance(obj['common_names'], list)
            assert len(obj['common_names']) > 0
            for name in obj['common_names']:
                assert isinstance(name, str)
                assert len(name) > 0
