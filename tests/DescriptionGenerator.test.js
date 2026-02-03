/**
 * @fileoverview Tests for DescriptionGenerator module.
 */

import {DescriptionGenerator, descriptionGenerator} from '../modules/data/DescriptionGenerator.js';

describe('DescriptionGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new DescriptionGenerator();
  });

  describe('generateStarDescription', () => {
    test('generates description for O-type star', () => {
      const star = {spect: 'O5V', mag: 4.5};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('very hot, blue star');
      expect(desc).toContain('main sequence');
    });

    test('generates description for G-type star', () => {
      const star = {spect: 'G2V', mag: 0.03};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('yellow star similar to our Sun');
    });

    test('generates description for M-type giant', () => {
      const star = {spect: 'M2III', mag: 1.0};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('cool, red star');
      expect(desc).toContain('giant');
    });

    test('generates description for supergiant', () => {
      const star = {spect: 'M2I', mag: 0.5};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('supergiant');
    });

    test('generates magnitude description for very bright star', () => {
      const star = {mag: -1.5};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('brightest stars in the sky');
    });

    test('generates magnitude description for bright star', () => {
      const star = {mag: 0.5};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('very bright star');
    });

    test('generates magnitude description for naked eye star', () => {
      const star = {mag: 4.0};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('naked eye under good conditions');
    });

    test('generates magnitude description for binocular object', () => {
      const star = {mag: 7.0};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('visible with binoculars');
    });

    test('generates magnitude description for telescope object', () => {
      const star = {mag: 10.0};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('visible with a telescope');
    });

    test('includes catalog identifiers', () => {
      const star = {hip: 91262, hd: 172167, hr: 7001};
      const desc = generator.generateStarDescription(star);

      expect(desc).toContain('HIP 91262');
      expect(desc).toContain('HD 172167');
      expect(desc).toContain('HR 7001');
    });

    test('returns null for object with no data', () => {
      const star = {};
      const desc = generator.generateStarDescription(star);
      expect(desc).toBe(null);
    });
  });

  describe('getWikipediaSearchTerms', () => {
    test('returns Messier article name for M objects', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'M31'});
      expect(terms).toContain('Messier_31');
    });

    test('returns NGC article name', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'NGC 7293'});
      expect(terms).toContain('NGC_7293');
    });

    test('strips leading zeros from NGC numbers', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'NGC0869'});
      expect(terms).toContain('NGC_869');
    });

    test('returns IC article name', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'IC 434'});
      expect(terms).toContain('IC_434');
    });

    test('returns planet article name with disambiguation', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'Mars'});
      expect(terms).toContain('Mars_(planet)');
    });

    test('handles all planets', () => {
      const planets = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
      planets.forEach((planet) => {
        const terms = generator.getWikipediaSearchTerms({name: planet});
        expect(terms).toContain(`${planet}_(planet)`);
      });
    });

    test('returns mapped Wikipedia article for famous stars', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'Sirius'});
      expect(terms).toContain('Sirius');
    });

    test('returns mapped Wikipedia article for stars with disambiguation', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'Mira'});
      expect(terms).toContain('Mira_(star)');
    });

    test('converts spaces to underscores for generic names', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'Andromeda Galaxy'});
      expect(terms).toContain('Andromeda_Galaxy');
    });

    test('skips catalog-only names', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'HIP 12345'});
      expect(terms).not.toContain('HIP_12345');
    });

    test('skips TYC catalog names', () => {
      const terms = generator.getWikipediaSearchTerms({name: 'TYC 1234-5678-1'});
      expect(terms).not.toContain('TYC_1234-5678-1');
    });
  });

  describe('getMagnitudeDescription', () => {
    test('describes brightest stars correctly', () => {
      expect(generator.getMagnitudeDescription(-1.5)).toContain('brightest');
    });

    test('describes very bright stars correctly', () => {
      expect(generator.getMagnitudeDescription(0.5)).toContain('very bright');
    });

    test('describes bright stars correctly', () => {
      expect(generator.getMagnitudeDescription(2.0)).toContain('bright star');
    });

    test('describes naked eye stars correctly', () => {
      expect(generator.getMagnitudeDescription(5.0)).toContain('naked eye');
    });

    test('describes binocular objects correctly', () => {
      expect(generator.getMagnitudeDescription(7.0)).toContain('binoculars');
    });

    test('describes telescope objects correctly', () => {
      expect(generator.getMagnitudeDescription(12.0)).toContain('telescope');
    });
  });

  describe('getSpectralDescription', () => {
    test('returns description for O-type', () => {
      expect(generator.getSpectralDescription('O5')).toContain('blue');
    });

    test('returns description for B-type', () => {
      expect(generator.getSpectralDescription('B3')).toContain('blue-white');
    });

    test('returns description for A-type', () => {
      expect(generator.getSpectralDescription('A0')).toContain('white');
    });

    test('returns description for F-type', () => {
      expect(generator.getSpectralDescription('F5')).toContain('yellow-white');
    });

    test('returns description for G-type', () => {
      expect(generator.getSpectralDescription('G2V')).toContain('Sun');
    });

    test('returns description for K-type', () => {
      expect(generator.getSpectralDescription('K5')).toContain('orange');
    });

    test('returns description for M-type', () => {
      expect(generator.getSpectralDescription('M3')).toContain('red');
    });

    test('returns null for null input', () => {
      expect(generator.getSpectralDescription(null)).toBe(null);
    });

    test('returns null for unknown spectral type', () => {
      expect(generator.getSpectralDescription('X9')).toBe(null);
    });
  });
});

describe('descriptionGenerator singleton', () => {
  test('is a DescriptionGenerator instance', () => {
    expect(descriptionGenerator).toBeInstanceOf(DescriptionGenerator);
  });

  test('provides working functionality', () => {
    const desc = descriptionGenerator.generateStarDescription({
      spect: 'G2V',
      mag: 0.03,
    });
    expect(desc).not.toBe(null);
  });
});
