/**
 * @fileoverview Game mode controller for object identification game.
 * Manages game state, questions, scoring, and feedback.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {domCache} from '../ui/DOMCache.js';
import {angularDistance, constellationCenter} from '../core/CoordinateUtils.js';
import {getAbbrevFromInternalKey, getConstellationName} from '../data/ConstellationNames.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('Game');

/**
 * @typedef {{
 *   name: string,
 *   displayName: string,
 *   type: string,
 *   data: {ra: number, dec: number, type: string}
 * }}
 */
let GameQuestion;

/**
 * Game categories with their configuration.
 * @const {!Object<string, {name: string, count: number}>}
 */
export const GAME_CATEGORIES = {
  'known-constellations': {name: 'Known Constellations', count: 12},
  'north-constellations': {name: 'Northern Constellations', count: 44},
  'south-constellations': {name: 'Southern Constellations', count: 44},
  'all-constellations': {name: 'All Constellations', count: 88},
  'famous-objects': {name: 'Famous Objects', count: 20},
  'star-clusters': {name: 'Star Clusters', count: 15},
  'nebulae': {name: 'Nebulae', count: 15},
  'galaxies': {name: 'Galaxies', count: 15},
  'bright-stars': {name: 'Bright Stars', count: 25},
  'messier-objects': {name: 'Messier Objects', count: 110},
};

/**
 * Well-known constellations for the "Known Constellations" category.
 * Note: Names must match keys in constellations.json (camelCase, no spaces)
 * @const {!Array<string>}
 */
const KNOWN_CONSTELLATIONS = [
  'Orion', 'UrsaMajor', 'UrsaMinor', 'Cassiopeia', 'Scorpius',
  'Cygnus', 'Leo', 'Gemini', 'Taurus', 'Aquila', 'Lyra', 'CanisMajor',
];

/**
 * Famous DSO names for the "Famous Objects" category.
 * @const {!Array<string>}
 */
const FAMOUS_OBJECTS = [
  'M31', 'M42', 'M45', 'M1', 'M51', 'M81', 'M82', 'M101', 'M104',
  'M13', 'M22', 'M27', 'M57', 'M8', 'M20', 'NGC7000', 'NGC2237',
  'NGC869', 'NGC884', 'NGC7293',
];

/**
 * Famous star names for the "Bright Stars" category.
 * @const {!Array<string>}
 */
const BRIGHT_STARS = [
  'Sirius', 'Canopus', 'Arcturus', 'Vega', 'Capella', 'Rigel',
  'Procyon', 'Betelgeuse', 'Altair', 'Aldebaran', 'Antares',
  'Spica', 'Pollux', 'Fomalhaut', 'Deneb', 'Regulus', 'Castor',
  'Polaris', 'Bellatrix', 'Alnilam', 'Alnitak', 'Mintaka',
  'Dubhe', 'Merak', 'Mizar',
];

/**
 * GameController manages the object identification game.
 */
export class GameController {
  /**
   * Creates a new GameController instance.
   */
  constructor() {
    /** @private {boolean} */
    this.active_ = false;

    /** @private {string} */
    this.category_ = 'known-constellations';

    /** @private {!Array<!GameQuestion>} */
    this.questionPool_ = [];

    /** @private {!Array<!GameQuestion>} */
    this.askedQuestions_ = [];

    /** @private {!Array<!GameQuestion>} */
    this.passedQuestions_ = [];

    /** @private {?GameQuestion} */
    this.currentQuestion_ = null;

    /** @private {boolean} - Prevents scoring during pass answer reveal */
    this.isShowingPassedAnswer_ = false;

    /** @private {boolean} - Prevents double game over alerts */
    this.isGameEnding_ = false;

    /** @private {boolean} - Prevents multiple scoring during answer feedback */
    this.isProcessingAnswer_ = false;

    /** @private {number} */
    this.score_ = 0;

    /** @private {number} */
    this.correct_ = 0;

    /** @private {?number} */
    this.startTime_ = null;

    /** @private {?number} */
    this.timerInterval_ = null;

    /**
     * Handle for the delay between answering a question and advancing to the
     * next one. Tracked so stop() can cancel it — otherwise it fires into a
     * subsequently started game. Only one is ever pending, since it always
     * ends in nextQuestion().
     * @private {?number}
     */
    this.advanceTimeout_ = null;

    // Data references (set by app)
    /** @private {!Object} */
    this.constellations_ = {};

    /** @private {!Array<!Object>} */
    this.deepSkyObjects_ = [];

    /** @private {!Object} */
    this.namedObjects_ = {};

    /** @private {!Array<!Object>} */
    this.stars_ = [];

    /**
     * Stars indexed by HIP, id and proper name, built on first use. Rebuilt
     * whenever setData replaces the star list. See getStarIndex_.
     * @private {?Map<(number|string), !Object>}
     */
    this.starByKey_ = null;

    /**
     * Constellation name to computed centre. Centres depend only on the star
     * and constellation data, so they survive for as long as that data does.
     * @private @const {!Map<string, {ra: number, dec: number}>}
     */
    this.constellationCenters_ = new Map();

    // Callback for camera navigation
    /** @private {?function(number, number): void} */
    this.onNavigateCallback_ = null;

    // Callback for constellation highlighting
    /** @private {?function(string): void} */
    this.onHighlightCallback_ = null;

    /** @private {?function(): void} */
    this.onUnhighlightCallback_ = null;

    // Callback for showing tour highlight
    /** @private {?function(number, number, number): void} */
    this.onShowHighlightCallback_ = null;

    /** @private {?function(): void} */
    this.onHideHighlightCallback_ = null;

    // Language for constellation names
    /** @private {string} */
    this.language_ = 'en';
  }

  /**
   * Set data references from the main app.
   * @param {!Object} data - Object containing constellations, dsos, etc.
   */
  setData(data) {
    this.constellations_ = data.constellations || {};
    this.deepSkyObjects_ = data.deepSkyObjects || [];
    this.namedObjects_ = data.namedObjects || {};
    this.stars_ = data.stars || [];
    this.starByKey_ = null;
    this.constellationCenters_.clear();
    logger.debug(`setData called with ${Object.keys(this.constellations_).length} constellations`);
  }

  /**
   * Set callback for camera navigation.
   * @param {function(number, number): void} callback - Navigation callback
   */
  setNavigateCallback(callback) {
    this.onNavigateCallback_ = callback;
  }

  /**
   * Set callbacks for constellation highlighting.
   * @param {function(string): void} highlight - Highlight callback
   * @param {function(): void} unhighlight - Unhighlight callback
   */
  setHighlightCallbacks(highlight, unhighlight) {
    this.onHighlightCallback_ = highlight;
    this.onUnhighlightCallback_ = unhighlight;
  }

  /**
   * Set callbacks for tour highlight ring.
   * @param {function(number, number, number): void} show - Show callback
   * @param {function(): void} hide - Hide callback
   */
  setTourHighlightCallbacks(show, hide) {
    this.onShowHighlightCallback_ = show;
    this.onHideHighlightCallback_ = hide;
  }

  /**
   * Set language for constellation name display.
   * @param {string} lang - Language code (e.g., 'en', 'fr', 'de')
   */
  setLanguage(lang) {
    this.language_ = lang;
  }

  /**
   * Get display name for a constellation (translated to current language).
   * @param {string} internalKey - Internal constellation key (e.g., 'UrsaMajor')
   * @returns {string} Translated display name (e.g., 'Grande Ourse' for French)
   * @private
   */
  getConstellationDisplayName_(internalKey) {
    // Convert internal key to IAU abbreviation, then get translated name
    const abbrev = getAbbrevFromInternalKey(internalKey);
    return getConstellationName(abbrev, this.language_);
  }

  /**
   * Set game category.
   * @param {string} category - Category ID
   */
  setCategory(category) {
    this.category_ = category;
  }

  /**
   * Get current category.
   * @returns {string} Current category ID
   */
  getCategory() {
    return this.category_;
  }

  /**
   * Check if game is active.
   * @returns {boolean} True if game is active
   */
  isActive() {
    return this.active_;
  }

  /**
   * Get current score.
   * @returns {number} Current score
   */
  getScore() {
    return this.score_;
  }

  /**
   * Get number of correct answers.
   * @returns {number} Correct count
   */
  getCorrect() {
    return this.correct_;
  }

  /**
   * Get current question.
   * @returns {?GameQuestion} Current question
   */
  getCurrentQuestion() {
    return this.currentQuestion_;
  }

  /**
   * Start the game.
   */
  start() {
    this.questionPool_ = this.buildQuestionPool_();

    logger.debug(`Built question pool with ${this.questionPool_.length} questions for category: ${this.category_}`);
    if (this.category_ === 'known-constellations') {
      logger.debug('Known constellations available:',
        Object.keys(this.constellations_).filter(k =>
          ['Orion', 'UrsaMajor', 'UrsaMinor', 'Cassiopeia', 'Scorpius',
           'Cygnus', 'Leo', 'Gemini', 'Taurus', 'Aquila', 'Lyra', 'CanisMajor'].includes(k)
        ).join(', '));
    }

    if (this.questionPool_.length === 0) {
      globalEventBus.emit(Events.GAME_STARTED, {error: 'No objects found'});
      return;
    }

    // A pending advance from a previous game would otherwise fire into this
    // one and skip its first question.
    this.clearAdvanceTimeout_();

    this.active_ = true;
    this.score_ = 0;
    this.correct_ = 0;
    this.startTime_ = Date.now();
    this.askedQuestions_ = [];
    this.passedQuestions_ = [];
    this.isShowingPassedAnswer_ = false;
    this.isGameEnding_ = false;
    this.isProcessingAnswer_ = false;

    // Update UI
    this.updateUI_();

    // Show game panel
    const gamePanel = domCache.gamePanel;
    if (gamePanel) {
      gamePanel.classList.add('active');
    }

    // Start timer
    this.startTimer_();

    // First question
    this.nextQuestion();

    globalEventBus.emit(Events.GAME_STARTED, {
      category: this.category_,
      totalQuestions: this.questionPool_.length,
    });
  }

  /**
   * Cancel a pending advance-to-next-question delay, if any.
   * @private
   */
  clearAdvanceTimeout_() {
    if (this.advanceTimeout_ !== null) {
      clearTimeout(this.advanceTimeout_);
      this.advanceTimeout_ = null;
    }
  }

  /**
   * Stop the game.
   */
  stop() {
    // Guard against double alerts
    if (this.isGameEnding_ || !this.active_) return;
    this.isGameEnding_ = true;

    logger.debug(`Stopping: asked ${this.askedQuestions_.length} of ${this.questionPool_.length} questions`);
    logger.debug('Asked questions:', this.askedQuestions_.map(q => q.name).join(', '));

    this.active_ = false;

    // Stop timer
    if (this.timerInterval_) {
      clearInterval(this.timerInterval_);
      this.timerInterval_ = null;
    }

    this.clearAdvanceTimeout_();

    // Hide game panel
    const gamePanel = domCache.gamePanel;
    if (gamePanel) {
      gamePanel.classList.remove('active');
    }

    const duration = this.startTime_ ? Math.floor((Date.now() - this.startTime_) / 1000) : 0;

    globalEventBus.emit(Events.GAME_STOPPED, {
      score: this.score_,
      correct: this.correct_,
      total: this.questionPool_.length,
      duration,
    });
  }

  /**
   * Move to the next question.
   */
  nextQuestion() {
    if (!this.active_) return;

    // Get remaining questions
    const remaining = this.questionPool_.filter((q) =>
      !this.askedQuestions_.some((asked) => asked.name === q.name)
    );

    logger.debug(`nextQuestion: ${remaining.length} remaining, ${this.askedQuestions_.length} asked`);

    if (remaining.length === 0) {
      // Guard against double alerts
      if (this.isGameEnding_) return;

      // Game complete
      this.stop();
      return;
    }

    // Pick random question
    const index = Math.floor(Math.random() * remaining.length);
    this.currentQuestion_ = remaining[index];
    this.askedQuestions_.push(this.currentQuestion_);

    // Update display
    this.updateQuestionDisplay_();

    globalEventBus.emit(Events.GAME_QUESTION, {
      question: this.currentQuestion_,
      progress: this.askedQuestions_.length,
      total: this.questionPool_.length,
    });
  }

  /**
   * Check answer by clicked object coordinates.
   * @param {number} ra - RA of clicked object
   * @param {number} dec - Dec of clicked object
   * @returns {boolean} True if correct
   */
  checkAnswer(ra, dec) {
    if (!this.currentQuestion_) return false;
    // Prevent scoring during pass answer reveal or while processing previous answer
    if (this.isShowingPassedAnswer_ || this.isProcessingAnswer_) return false;

    const target = this.currentQuestion_.data;
    const distance = angularDistance(ra, dec, target.ra, target.dec);

    // Larger tolerance for constellations
    const tolerance = target.type === 'Constellation' ? 15 : 5;

    if (distance < tolerance) {
      this.markCorrect_();
      return true;
    }

    return false;
  }

  /**
   * Check answer by name (for constellation line clicks).
   * @param {string} name - Name of clicked constellation
   * @returns {boolean} True if correct
   */
  checkAnswerByName(name) {
    if (!this.currentQuestion_) return false;
    // Prevent scoring during pass answer reveal or while processing previous answer
    if (this.isShowingPassedAnswer_ || this.isProcessingAnswer_) return false;

    if (name.toLowerCase() === this.currentQuestion_.name.toLowerCase()) {
      this.markCorrect_();
      return true;
    }

    return false;
  }

  /**
   * Pass the current question (show answer).
   */
  passQuestion() {
    // Guard against rapid multiple passes or passing while already showing answer
    if (!this.currentQuestion_ || this.isShowingPassedAnswer_ || this.isProcessingAnswer_) {
      return;
    }

    // Set flag to prevent scoring and multiple passes during answer reveal
    this.isShowingPassedAnswer_ = true;

    this.passedQuestions_.push(this.currentQuestion_);

    this.updateUI_();

    const questionData = this.currentQuestion_.data;
    const questionName = this.currentQuestion_.name;
    const displayName = this.currentQuestion_.displayName || questionName;

    // Update display
    const questionEl = domCache.gameQuestion;
    if (questionEl) {
      questionEl.style.color = '#F59E0B';
      questionEl.textContent = `${displayName} (Answer shown)`;
    }

    // Navigate to object
    if (this.onNavigateCallback_) {
      this.onNavigateCallback_(questionData.ra, questionData.dec);
    }

    // Show highlight ring
    const angularSize = questionData.size_major || questionData.angularSize || 30;
    logger.debug('Showing highlight at', questionData.ra, questionData.dec, 'size:', angularSize);
    if (this.onShowHighlightCallback_) {
      this.onShowHighlightCallback_(questionData.ra, questionData.dec, angularSize);
    } else {
      logger.warn('onShowHighlightCallback_ is not set!');
    }

    // Highlight constellation if applicable
    if (questionData.type === 'Constellation' && this.onHighlightCallback_) {
      this.onHighlightCallback_(questionName);
    }

    globalEventBus.emit(Events.GAME_PASSED, {
      question: this.currentQuestion_,
    });

    // Wait then continue
    this.advanceTimeout_ = setTimeout(() => {
      this.advanceTimeout_ = null;
      // Reset the pass flag before moving to next question
      this.isShowingPassedAnswer_ = false;

      if (questionEl) {
        questionEl.style.color = '#60A5FA';
      }

      if (this.onHideHighlightCallback_) {
        this.onHideHighlightCallback_();
      }

      if (questionData.type === 'Constellation' && this.onUnhighlightCallback_) {
        this.onUnhighlightCallback_();
      }

      this.nextQuestion();
    }, 3000);
  }

  /**
   * Mark current answer as correct.
   * @private
   */
  markCorrect_() {
    // Prevent double scoring for same question
    this.isProcessingAnswer_ = true;

    this.score_ += 100;
    this.correct_ += 1;

    this.updateUI_();

    // Visual feedback
    const questionEl = domCache.gameQuestion;
    if (questionEl) {
      questionEl.style.color = '#10B981';
    }

    // Highlight constellation if applicable
    const questionData = this.currentQuestion_?.data;
    const questionName = this.currentQuestion_?.name;

    if (questionData?.type === 'Constellation' && this.onHighlightCallback_) {
      this.onHighlightCallback_(questionName);
    }

    globalEventBus.emit(Events.GAME_CORRECT, {
      question: this.currentQuestion_,
      score: this.score_,
      correct: this.correct_,
    });

    // Wait then continue
    this.advanceTimeout_ = setTimeout(() => {
      this.advanceTimeout_ = null;
      if (questionEl) {
        questionEl.style.color = '#60A5FA';
      }

      if (questionData?.type === 'Constellation' && this.onUnhighlightCallback_) {
        this.onUnhighlightCallback_();
      }

      this.isProcessingAnswer_ = false;
      this.nextQuestion();
    }, 1000);
  }

  /**
   * Build the question pool for current category.
   * @returns {!Array<!GameQuestion>} Question pool
   * @private
   */
  buildQuestionPool_() {
    const pool = [];

    switch (this.category_) {
      case 'known-constellations':
        this.addConstellationQuestions_(pool, KNOWN_CONSTELLATIONS);
        break;

      case 'north-constellations':
        this.addConstellationsByHemisphere_(pool, 'north');
        break;

      case 'south-constellations':
        this.addConstellationsByHemisphere_(pool, 'south');
        break;

      case 'all-constellations':
        this.addAllConstellationQuestions_(pool);
        break;

      case 'famous-objects':
        this.addDSOQuestions_(pool, FAMOUS_OBJECTS);
        break;

      case 'star-clusters':
        this.addDSOsByType_(pool, ['GCl', 'OCl']);
        break;

      case 'nebulae':
        this.addDSOsByType_(pool, ['Neb', 'PN', 'EmN', 'HII', 'Cl+N']);
        break;

      case 'galaxies':
        this.addDSOsByType_(pool, ['G']);
        break;

      case 'bright-stars':
        this.addStarQuestions_(pool, BRIGHT_STARS);
        break;

      case 'messier-objects':
        this.addMessierQuestions_(pool);
        break;
    }

    return pool;
  }

  /**
   * Stars indexed by HIP, catalogue id and proper name, built on first use.
   *
   * One first-wins index over every key anything looks a star up by.
   * Equivalent to the scans it replaces — inserting in array order means the
   * first star that could have matched still wins — but O(1) rather than a
   * full pass over ~41,000 stars per lookup. The two callers were costing
   * ~30M comparisons per constellation game and ~1M per bright-star game.
   *
   * @returns {!Map<(number|string), !Object>} The index
   * @private
   */
  getStarIndex_() {
    if (this.starByKey_) return this.starByKey_;

    this.starByKey_ = new Map();
    for (const star of this.stars_) {
      if (star.hip != null && !this.starByKey_.has(star.hip)) {
        this.starByKey_.set(star.hip, star);
      }
      if (star.id != null && !this.starByKey_.has(star.id)) {
        this.starByKey_.set(star.id, star);
      }
      if (star.proper && !this.starByKey_.has(star.proper)) {
        this.starByKey_.set(star.proper, star);
      }
    }
    return this.starByKey_;
  }

  /**
   * Calculate the center coordinates of a constellation from its star positions.
   * Uses circular mean for RA to correctly handle constellations spanning the
   * 0°/360° boundary (e.g., Pegasus, Pisces, Andromeda).
   * @param {!Object} constData - Constellation data with lines array
   * @returns {{ra: number, dec: number}} Center coordinates
   * @private
   */
  getConstellationCenter_(constData, name) {
    if (name && this.constellationCenters_.has(name)) {
      return this.constellationCenters_.get(name);
    }

    const byKey = this.getStarIndex_();
    const center = constellationCenter(constData, (id) => byKey.get(id));
    if (name) this.constellationCenters_.set(name, center);
    return center;
  }

  /**
   * Add constellation questions by name list.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {!Array<string>} names - Constellation names
   * @private
   */
  addConstellationQuestions_(pool, names) {
    logger.debug('addConstellationQuestions_ called with', names.length, 'names:', names.join(', '));
    logger.debug('Available constellations in data:', Object.keys(this.constellations_).join(', '));
    names.forEach((name) => {
      const constData = this.constellations_[name];
      if (constData) {
        const center = this.getConstellationCenter_(constData, name);
        pool.push({
          name,
          displayName: this.getConstellationDisplayName_(name),
          type: 'Constellation',
          data: {
            ra: center.ra,
            dec: center.dec,
            type: 'Constellation',
          },
        });
        logger.debug(`Added question for: ${name}`);
      } else {
        logger.debug(`Missing constellation: ${name}`);
      }
    });
    logger.debug('Pool size after adding constellations:', pool.length);
  }

  /**
   * Add all constellation questions.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @private
   */
  addAllConstellationQuestions_(pool) {
    Object.keys(this.constellations_).forEach((name) => {
      const constData = this.constellations_[name];
      const center = this.getConstellationCenter_(constData, name);
      pool.push({
        name,
        displayName: this.getConstellationDisplayName_(name),
        type: 'Constellation',
        data: {
          ra: center.ra,
          dec: center.dec,
          type: 'Constellation',
        },
      });
    });
  }

  /**
   * Add constellations by hemisphere.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {string} hemisphere - 'north' or 'south'
   * @private
   */
  addConstellationsByHemisphere_(pool, hemisphere) {
    Object.keys(this.constellations_).forEach((name) => {
      const constData = this.constellations_[name];
      const center = this.getConstellationCenter_(constData, name);

      if ((hemisphere === 'north' && center.dec >= 0) ||
          (hemisphere === 'south' && center.dec < 0)) {
        pool.push({
          name,
          displayName: this.getConstellationDisplayName_(name),
          type: 'Constellation',
          data: {
            ra: center.ra,
            dec: center.dec,
            type: 'Constellation',
          },
        });
      }
    });
  }

  /**
   * Add DSO questions by name list.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {!Array<string>} names - DSO names
   * @private
   */
  addDSOQuestions_(pool, names) {
    names.forEach((name) => {
      const dso = this.deepSkyObjects_.find((d) =>
        d.name === name ||
        (d.messier && `M${d.messier}` === name)
      );
      if (dso) {
        const displayName = dso.name || `M${dso.messier}`;
        pool.push({
          name: displayName,
          displayName,
          type: 'DSO',
          data: {
            ra: dso.ra,
            dec: dso.dec,
            type: dso.type,
            size_major: dso.size_major,
          },
        });
      }
    });
  }

  /**
   * Add DSO questions by type.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {!Array<string>} types - DSO types
   * @private
   */
  addDSOsByType_(pool, types) {
    const filtered = this.deepSkyObjects_
      .filter((d) => types.includes(d.type) && d.mag && d.mag < 10)
      .sort((a, b) => (a.mag || 99) - (b.mag || 99))
      .slice(0, 15);

    filtered.forEach((dso) => {
      const displayName = dso.name || `M${dso.messier}` || `NGC${dso.ngc}`;
      pool.push({
        name: displayName,
        displayName,
        type: 'DSO',
        data: {
          ra: dso.ra,
          dec: dso.dec,
          type: dso.type,
          size_major: dso.size_major,
        },
      });
    });
  }

  /**
   * Add star questions by name list.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {!Array<string>} names - Star names
   * @private
   */
  addStarQuestions_(pool, names) {
    const byKey = this.getStarIndex_();
    names.forEach((name) => {
      const star = byKey.get(name);
      if (star) {
        pool.push({
          name,
          displayName: name,
          type: 'Star',
          data: {
            ra: star.ra,
            dec: star.dec,
            type: 'Star',
          },
        });
      }
    });
  }

  /**
   * Add Messier object questions.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @private
   */
  addMessierQuestions_(pool) {
    this.deepSkyObjects_
      .filter((d) => d.messier)
      .forEach((dso) => {
        const displayName = `M${dso.messier}`;
        pool.push({
          name: displayName,
          displayName,
          type: 'DSO',
          data: {
            ra: dso.ra,
            dec: dso.dec,
            type: dso.type,
            size_major: dso.size_major,
          },
        });
      });
  }

  /**
   * Start the game timer.
   * @private
   */
  startTimer_() {
    if (this.timerInterval_) {
      clearInterval(this.timerInterval_);
    }

    this.timerInterval_ = setInterval(() => {
      if (!this.active_) return;

      const duration = Math.floor((Date.now() - this.startTime_) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;

      const timeEl = domCache.gameTime;
      if (timeEl) {
        timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  /**
   * Update UI elements.
   * @private
   */
  updateUI_() {
    const scoreEl = domCache.gameScore;
    const correctEl = domCache.gameCorrect;

    if (scoreEl) {
      const progress = `${this.askedQuestions_.length}/${this.questionPool_.length}`;
      scoreEl.textContent = `${this.score_} (${progress})`;
    }

    if (correctEl) {
      correctEl.textContent = String(this.correct_);
    }

    globalEventBus.emit(Events.GAME_SCORE_UPDATED, {
      score: this.score_,
      correct: this.correct_,
    });
  }

  /**
   * Update question display.
   * @private
   */
  updateQuestionDisplay_() {
    const questionEl = domCache.gameQuestion;
    if (questionEl && this.currentQuestion_) {
      // Use displayName for user-facing text (translated for constellations)
      questionEl.textContent = this.currentQuestion_.displayName ||
          this.currentQuestion_.name;
      questionEl.style.color = '#60A5FA';
    }
  }
}

/**
 * Singleton instance for application-wide game control.
 * @const {!GameController}
 */
export const gameController = new GameController();
