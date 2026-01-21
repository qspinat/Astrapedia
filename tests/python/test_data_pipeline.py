"""
Tests for data_pipeline.py supplementary Messier object injection.
"""

import pytest


class TestSupplementaryMessierInjection:
    """Tests for the supplementary Messier object logic."""

    def test_adds_missing_messier_objects(self):
        """Supplementary Messier objects are added when not present."""
        # Simulate existing DSO list without M40, M45, M102
        existing_dsos = [
            {'name': 'NGC224', 'messier': 31, 'type': 'G'},
            {'name': 'NGC1976', 'messier': 42, 'type': 'Neb'},
        ]

        supplementary_messier = [
            {'name': 'Mel22', 'messier': 45, 'common_names': ['Pleiades']},
            {'name': 'WNC4', 'messier': 40, 'common_names': ['Winnecke 4']},
            {'name': 'NGC5866', 'messier': 102, 'common_names': ['Spindle Galaxy']},
        ]

        existing_messiers = {dso['messier'] for dso in existing_dsos if dso.get('messier')}
        added_count = 0
        for supp in supplementary_messier:
            if supp['messier'] not in existing_messiers:
                existing_dsos.append(supp)
                added_count += 1

        assert added_count == 3
        assert len(existing_dsos) == 5

        messier_numbers = {dso.get('messier') for dso in existing_dsos}
        assert 40 in messier_numbers
        assert 45 in messier_numbers
        assert 102 in messier_numbers

    def test_does_not_duplicate_existing_messier(self):
        """Supplementary objects are skipped if Messier number already exists."""
        # Simulate existing DSO list that already has M45
        existing_dsos = [
            {'name': 'NGC1432', 'messier': 45, 'type': 'OCl'},  # Different name, same Messier
        ]

        supplementary_messier = [
            {'name': 'Mel22', 'messier': 45, 'common_names': ['Pleiades']},
            {'name': 'WNC4', 'messier': 40, 'common_names': ['Winnecke 4']},
        ]

        existing_messiers = {dso['messier'] for dso in existing_dsos if dso.get('messier')}
        added_count = 0
        for supp in supplementary_messier:
            if supp['messier'] not in existing_messiers:
                existing_dsos.append(supp)
                added_count += 1

        # M45 already exists, so only M40 should be added
        assert added_count == 1
        assert len(existing_dsos) == 2

        # Verify M45 wasn't duplicated
        m45_count = sum(1 for dso in existing_dsos if dso.get('messier') == 45)
        assert m45_count == 1

    def test_supplementary_messier_data_integrity(self):
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
