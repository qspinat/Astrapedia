/**
 * @fileoverview Description generator for celestial objects.
 * Provides descriptions and Wikipedia search terms for stars and DSOs.
 */

/**
 * Spectral type descriptions.
 * @const {!Object<string, string>}
 */
const SPECTRAL_DESCRIPTIONS = {
  'O': 'a very hot, blue star',
  'B': 'a hot, blue-white star',
  'A': 'a white star',
  'F': 'a yellow-white star',
  'G': 'a yellow star similar to our Sun',
  'K': 'an orange star',
  'M': 'a cool, red star',
  'L': 'a very cool, brown dwarf',
  'T': 'a cool brown dwarf',
  'Y': 'an ultra-cool brown dwarf',
  'C': 'a carbon star',
  'S': 'a red giant with zirconium oxide',
  'W': 'a Wolf-Rayet star',
};

/**
 * Star name to Wikipedia article mapping.
 * @const {!Object<string, string>}
 */
const STAR_WIKIPEDIA_MAPPING = {
  // Top 20 brightest
  'Sirius': 'Sirius', 'Canopus': 'Canopus', 'Vega': 'Vega', 'Arcturus': 'Arcturus',
  'Capella': 'Capella', 'Rigel': 'Rigel', 'Procyon': 'Procyon', 'Betelgeuse': 'Betelgeuse',
  'Achernar': 'Achernar', 'Hadar': 'Hadar', 'Altair': 'Altair', 'Aldebaran': 'Aldebaran',
  'Antares': 'Antares', 'Spica': 'Spica', 'Pollux': 'Pollux', 'Fomalhaut': 'Fomalhaut',
  'Deneb': 'Deneb', 'Mimosa': 'Beta_Crucis', 'Acrux': 'Alpha_Crucis', 'Regulus': 'Regulus',
  // Navigation stars
  'Polaris': 'Polaris', 'Alioth': 'Alioth', 'Dubhe': 'Dubhe', 'Alkaid': 'Alkaid',
  'Merak': 'Merak', 'Mizar': 'Mizar', 'Alcor': 'Alcor',
  // Notable stars
  'Castor': 'Castor_(star)', 'Bellatrix': 'Bellatrix', 'Alnilam': 'Alnilam',
  'Alnitak': 'Alnitak', 'Mintaka': 'Mintaka', 'Saiph': 'Saiph',
  'Algol': 'Algol', 'Mira': 'Mira_(star)', 'Denebola': 'Denebola',
  'Rasalhague': 'Rasalhague', 'Eltanin': 'Eltanin', 'Alphard': 'Alphard',
  'Schedar': 'Schedar', 'Mirach': 'Mirach', 'Alpheratz': 'Alpheratz',
  'Enif': 'Enif', 'Markab': 'Markab', 'Algenib': 'Algenib',
  'Mirfak': 'Mirfak', 'Almach': 'Almach', 'Hamal': 'Hamal',
  'Sheratan': 'Sheratan', 'Alcyone': 'Alcyone_(star)', 'Atlas': 'Atlas_(star)',
  'Electra': 'Electra_(star)', 'Maia': 'Maia_(star)', 'Merope': 'Merope_(star)',
  'Taygeta': 'Taygeta_(star)', 'Pleione': 'Pleione_(star)', 'Celaeno': 'Celaeno_(star)',
  'Vindemiatrix': 'Vindemiatrix', 'Zubenelgenubi': 'Zubenelgenubi', 'Zubeneschamali': 'Zubeneschamali',
  'Nunki': 'Nunki', 'Kaus Australis': 'Kaus_Australis', 'Shaula': 'Shaula',
  'Sargas': 'Sargas', 'Dschubba': 'Dschubba', 'Graffias': 'Graffias',
  'Atria': 'Atria', 'Peacock': 'Peacock_(star)', 'Alnair': 'Alnair',
  'Formalhaut': 'Fomalhaut', 'Diphda': 'Diphda', 'Ankaa': 'Ankaa',
  'Acamar': 'Acamar', 'Zaurak': 'Zaurak', 'Cursa': 'Cursa',
  'Arneb': 'Arneb', 'Nihal': 'Nihal', 'Wezen': 'Wezen',
  'Adhara': 'Adhara', 'Furud': 'Furud', 'Aludra': 'Aludra',
  'Naos': 'Naos_(star)', 'Suhail': 'Suhail', 'Avior': 'Avior',
  'Miaplacidus': 'Miaplacidus', 'Aspidiske': 'Aspidiske', 'Turais': 'Rho_Puppis',
  'Gacrux': 'Gacrux', 'Muhlifain': 'Gamma_Centauri', 'Menkent': 'Menkent',
  'Izar': 'Izar_(star)', 'Kochab': 'Kochab', 'Pherkad': 'Pherkad',
  'Thuban': 'Thuban', 'Rastaban': 'Rastaban', 'Etamin': 'Eltanin',
  'Albireo': 'Albireo', 'Sadr': 'Sadr_(star)', 'Gienah': 'Gienah',
  'Algedi': 'Algedi', 'Dabih': 'Dabih', 'Nashira': 'Nashira',
  'Deneb Algedi': 'Deneb_Algedi', 'Sadalmelik': 'Sadalmelik', 'Sadalsuud': 'Sadalsuud',
  'Skat': 'Skat_(star)', 'Ancha': 'Ancha',
};

/**
 * DescriptionGenerator provides descriptions for celestial objects.
 */
export class DescriptionGenerator {
  /**
   * Generate a description for a star based on its catalog data.
   * @param {!Object} obj - Star object with properties like mag, spect, ci, hip
   * @returns {?string} Generated description or null if not enough data
   */
  generateStarDescription(obj) {
    const parts = [];

    // Spectral type description
    if (obj.spect) {
      const spectClass = obj.spect.charAt(0).toUpperCase();
      if (SPECTRAL_DESCRIPTIONS[spectClass]) {
        let desc = `This is ${SPECTRAL_DESCRIPTIONS[spectClass]}`;

        // Add luminosity class description
        if (obj.spect.includes('I') && !obj.spect.includes('II') &&
            !obj.spect.includes('III') && !obj.spect.includes('IV')) {
          desc += ' (supergiant)';
        } else if (obj.spect.includes('III')) {
          desc += ' (giant)';
        } else if (obj.spect.includes('V')) {
          desc += ' (main sequence)';
        }
        desc += '.';
        parts.push(desc);
      }
    }

    // Magnitude description
    if (obj.mag !== undefined && obj.mag !== null) {
      const mag = obj.mag;
      let magDesc;
      if (mag < 0) {
        magDesc = 'one of the brightest stars in the sky';
      } else if (mag < 1) {
        magDesc = 'a very bright star, easily visible to the naked eye';
      } else if (mag < 3) {
        magDesc = 'a bright star visible to the naked eye';
      } else if (mag < 6) {
        magDesc = 'visible to the naked eye under good conditions';
      } else if (mag < 8) {
        magDesc = 'visible with binoculars';
      } else {
        magDesc = 'visible with a telescope';
      }
      parts.push(`With an apparent magnitude of ${mag.toFixed(2)}, it is ${magDesc}.`);
    }

    // Catalog identifiers
    const catalogs = [];
    if (obj.hip) catalogs.push(`HIP ${obj.hip}`);
    if (obj.hd) catalogs.push(`HD ${obj.hd}`);
    if (obj.hr) catalogs.push(`HR ${obj.hr}`);
    if (catalogs.length > 0) {
      parts.push(`Catalog designation: ${catalogs.join(', ')}.`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Get Wikipedia search terms for an object.
   * @param {!Object} obj - Object with name property
   * @returns {!Array<string>} Array of potential Wikipedia article names
   */
  getWikipediaSearchTerms(obj) {
    const terms = [];
    // Prefer internalName (catalog key like 'M104') over display name
    // which may be localized (e.g., 'Galaxie du Sombrero')
    const name = obj.internalName || obj.name;
    if (!name) return terms;

    // Messier objects have specific Wikipedia titles
    const messierMatch = name.match(/M(\d+)/i);
    if (messierMatch) {
      terms.push(`Messier_${messierMatch[1]}`);
    }

    // NGC objects - remove leading zeros for Wikipedia (NGC0869 -> NGC_869)
    const ngcMatch = name.match(/NGC\s*0*(\d+)/i);
    if (ngcMatch) {
      terms.push(`NGC_${ngcMatch[1]}`);
    }

    // IC objects - format as IC_number for Wikipedia
    const icMatch = name.match(/IC\s*0*(\d+)/i);
    if (icMatch) {
      terms.push(`IC_${icMatch[1]}`);
    }

    // Planets - check internalName (always English)
    if (['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name)) {
      terms.push(`${name}_(planet)`);
    }

    // Famous stars/objects with common names
    if (STAR_WIKIPEDIA_MAPPING[name]) {
      terms.push(STAR_WIKIPEDIA_MAPPING[name]);
    }

    // Add English common names from raw data (e.g., 'Sombrero Galaxy')
    const data = obj.data;
    if (data?.common_names) {
      const commonNames = Array.isArray(data.common_names)
        ? data.common_names
        : data.common_names.split(',').map((n) => n.trim()).filter(Boolean);
      for (const cn of commonNames) {
        const wikiTerm = cn.replace(/\s+/g, '_');
        if (!terms.includes(wikiTerm)) {
          terms.push(wikiTerm);
        }
      }
    }

    // Skip catalog-only names that don't have Wikipedia articles
    const catalogPattern = /^(HIP|TYC|HD|HR|SAO|BD|CD|CPD|UCAC|2MASS|GAIA)\s*[\d\-\+]+$/i;
    if (!catalogPattern.test(name)) {
      const wikiName = name.replace(/\s+/g, '_');
      if (!terms.includes(wikiName)) {
        terms.push(wikiName);
      }
    }

    return terms;
  }

  /**
   * Get magnitude visibility description.
   * @param {number} mag - Apparent magnitude
   * @returns {string} Description of visibility
   */
  getMagnitudeDescription(mag) {
    if (mag < 0) {
      return 'one of the brightest stars in the sky';
    } else if (mag < 1) {
      return 'a very bright star, easily visible to the naked eye';
    } else if (mag < 3) {
      return 'a bright star visible to the naked eye';
    } else if (mag < 6) {
      return 'visible to the naked eye under good conditions';
    } else if (mag < 8) {
      return 'visible with binoculars';
    } else {
      return 'visible with a telescope';
    }
  }

  /**
   * Get spectral type description.
   * @param {string} spectralType - Spectral type string (e.g., 'G2V')
   * @returns {?string} Human-readable description or null
   */
  getSpectralDescription(spectralType) {
    if (!spectralType) return null;
    const spectClass = spectralType.charAt(0).toUpperCase();
    return SPECTRAL_DESCRIPTIONS[spectClass] || null;
  }
}

/**
 * Singleton instance for application-wide description generation.
 * @const {!DescriptionGenerator}
 */
export const descriptionGenerator = new DescriptionGenerator();
