/**
 * @fileoverview Fatal-error card shown in place of the loading screen.
 *
 * debug.js (a classic script that runs before any module) keeps its own copy
 * of this for errors that happen before modules load; keep the two in step.
 */

import {domCache} from './DOMCache.js';

/**
 * Replace the loading screen's contents with an error card and Retry button.
 *
 * Built with DOM calls rather than innerHTML: the detail is usually an error
 * message (untrusted text), and the CSP forbids inline onclick handlers.
 * @param {string} title - Short headline, e.g. 'Failed to start'
 * @param {string} detail - Explanation shown under the title
 * @param {string=} icon - Emoji shown above the title
 */
export function showLoadingError(title, detail, icon = '⚠️') {
  const loading = domCache.loading;
  if (!loading) return;

  const card = document.createElement('div');
  card.className = 'loading-error';
  for (const [cls, text] of [['icon', icon], ['title', title], ['detail', detail]]) {
    const el = document.createElement('div');
    el.className = `loading-error-${cls}`;
    el.textContent = text;
    card.appendChild(el);
  }
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => location.reload());
  card.appendChild(retry);

  loading.replaceChildren(card);
  loading.classList.remove('hidden');
}
