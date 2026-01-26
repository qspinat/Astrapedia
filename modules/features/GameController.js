/**
 * @fileoverview Game mode controller for object identification game.
 * Manages game state, questions, scoring, and feedback.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {GAME} from '../core/Constants.js';
import {domCache} from '../ui/DOMCache.js';
import {angularDistance} from '../core/CoordinateUtils.js';

/**
 * @typedef {{
 *   name: string,
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

    /** @private {number} */
    this.score_ = 0;

    /** @private {number} */
    this.correct_ = 0;

    /** @private {?number} */
    this.startTime_ = null;

    /** @private {?number} */
    this.timerInterval_ = null;

    // Data references (set by app)
    /** @private {!Object} */
    this.constellations_ = {};

    /** @private {!Array<!Object>} */
    this.deepSkyObjects_ = [];

    /** @private {!Object} */
    this.namedObjects_ = {};

    /** @private {!Array<!Object>} */
    this.stars_ = [];

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

    if (this.questionPool_.length === 0) {
      globalEventBus.emit(Events.GAME_STARTED, {error: 'No objects found'});
      return;
    }

    this.active_ = true;
    this.score_ = 0;
    this.correct_ = 0;
    this.startTime_ = Date.now();
    this.askedQuestions_ = [];
    this.passedQuestions_ = [];
    this.isShowingPassedAnswer_ = false;
    this.isGameEnding_ = false;

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
   * Stop the game.
   */
  stop() {
    // Guard against double alerts
    if (this.isGameEnding_ || !this.active_) return;
    this.isGameEnding_ = true;

    this.active_ = false;

    // Stop timer
    if (this.timerInterval_) {
      clearInterval(this.timerInterval_);
      this.timerInterval_ = null;
    }

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
    // Prevent scoring during pass answer reveal
    if (this.isShowingPassedAnswer_) return false;

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
    // Prevent scoring during pass answer reveal
    if (this.isShowingPassedAnswer_) return false;

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
    if (!this.currentQuestion_) return;

    // Set flag to prevent scoring during answer reveal
    this.isShowingPassedAnswer_ = true;

    this.passedQuestions_.push(this.currentQuestion_);

    const questionData = this.currentQuestion_.data;
    const questionName = this.currentQuestion_.name;

    // Update display
    const questionEl = domCache.gameQuestion;
    if (questionEl) {
      questionEl.style.color = '#F59E0B';
      questionEl.textContent = `${questionName} (Answer shown)`;
    }

    // Navigate to object
    if (this.onNavigateCallback_) {
      this.onNavigateCallback_(questionData.ra, questionData.dec);
    }

    // Show highlight ring
    const angularSize = questionData.size_major || questionData.angularSize || 30;
    if (this.onShowHighlightCallback_) {
      this.onShowHighlightCallback_(questionData.ra, questionData.dec, angularSize);
    }

    // Highlight constellation if applicable
    if (questionData.type === 'Constellation' && this.onHighlightCallback_) {
      this.onHighlightCallback_(questionName);
    }

    globalEventBus.emit(Events.GAME_PASSED, {
      question: this.currentQuestion_,
    });

    // Wait then continue
    setTimeout(() => {
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
    setTimeout(() => {
      if (questionEl) {
        questionEl.style.color = '#60A5FA';
      }

      if (questionData?.type === 'Constellation' && this.onUnhighlightCallback_) {
        this.onUnhighlightCallback_();
      }

      this.nextQuestion();
    }, 500);
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
   * Calculate the center coordinates of a constellation from its star positions.
   * @param {!Object} constData - Constellation data with lines array
   * @returns {{ra: number, dec: number}} Center coordinates
   * @private
   */
  getConstellationCenter_(constData) {
    // If constellation data already has ra/dec, use those
    if (constData?.ra !== undefined && constData?.dec !== undefined) {
      return {ra: constData.ra, dec: constData.dec};
    }

    if (!constData?.lines || constData.lines.length === 0) {
      return {ra: 0, dec: 0};
    }

    // Collect unique star IDs from the lines
    const starIds = new Set();
    constData.lines.forEach((line) => {
      if (Array.isArray(line)) {
        line.forEach((id) => starIds.add(id));
      }
    });

    if (starIds.size === 0) {
      return {ra: 0, dec: 0};
    }

    // Find stars and calculate average position
    let sumRa = 0;
    let sumDec = 0;
    let count = 0;

    starIds.forEach((id) => {
      const star = this.stars_.find((s) => s.hip === id || s.id === id);
      if (star && star.ra !== undefined && star.dec !== undefined) {
        sumRa += star.ra;
        sumDec += star.dec;
        count++;
      }
    });

    if (count === 0) {
      return {ra: 0, dec: 0};
    }

    return {
      ra: sumRa / count,
      dec: sumDec / count,
    };
  }

  /**
   * Add constellation questions by name list.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @param {!Array<string>} names - Constellation names
   * @private
   */
  addConstellationQuestions_(pool, names) {
    names.forEach((name) => {
      const constData = this.constellations_[name];
      if (constData) {
        const center = this.getConstellationCenter_(constData);
        pool.push({
          name,
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
   * Add all constellation questions.
   * @param {!Array<!GameQuestion>} pool - Question pool to add to
   * @private
   */
  addAllConstellationQuestions_(pool) {
    Object.keys(this.constellations_).forEach((name) => {
      const constData = this.constellations_[name];
      const center = this.getConstellationCenter_(constData);
      pool.push({
        name,
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
      const center = this.getConstellationCenter_(constData);

      if ((hemisphere === 'north' && center.dec >= 0) ||
          (hemisphere === 'south' && center.dec < 0)) {
        pool.push({
          name,
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
        pool.push({
          name: dso.name || `M${dso.messier}`,
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
      pool.push({
        name: dso.name || `M${dso.messier}` || `NGC${dso.ngc}`,
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
    names.forEach((name) => {
      const star = this.stars_.find((s) => s.proper === name);
      if (star) {
        pool.push({
          name,
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
        pool.push({
          name: `M${dso.messier}`,
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
      questionEl.textContent = this.currentQuestion_.name;
      questionEl.style.color = '#60A5FA';
    }
  }
}

/**
 * Singleton instance for application-wide game control.
 * @const {!GameController}
 */
export const gameController = new GameController();
