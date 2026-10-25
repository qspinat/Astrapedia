#!/usr/bin/env node
/**
 * @fileoverview Checks every curated and planet image URL still serves a
 * usable image. Needs the network, so it is run by hand, not in CI:
 *
 *   node scripts/check-image-urls.mjs
 *
 * A URL passes when it returns HTTP 200 with an image content type, carries
 * an Access-Control-Allow-Origin header (WebGL textures are loaded with
 * crossOrigin='anonymous' and fail silently without it), and is under 5 MB.
 * Wikimedia thumbnails only exist at standard widths (330/500/960/1280/1920);
 * any other width returns HTTP 400.
 */

import {CURATED_IMAGES} from '../modules/data/CuratedImages.js';
import {PLANET_IMAGES} from '../modules/data/PlanetImages.js';

const MAX_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = 2;
const MAX_RETRIES = 3;
const USER_AGENT = 'Astrapedia image check (https://github.com/qspinat/Astrapedia)';

const targets = [
  ...Object.entries(CURATED_IMAGES)
      .filter(([, entry]) => entry.url)
      .map(([name, entry]) => ({name, url: entry.url})),
  ...Object.entries(PLANET_IMAGES).flatMap(([name, entry]) => [
    {name, url: entry.primary},
    ...(entry.fallback ? [{name: `${name} (fallback)`, url: entry.fallback}] : []),
  ]),
];

/**
 * @param {{name: string, url: string}} target
 * @returns {!Promise<{name: string, url: string, problems: !Array<string>, info: string}>}
 */
async function check({name, url}) {
  const problems = [];
  let info = '';
  try {
    let response;
    for (let attempt = 0; ; attempt++) {
      response = await fetch(url, {
        headers: {'User-Agent': USER_AGENT, 'Origin': 'https://localhost'},
        signal: AbortSignal.timeout(30000),
      });
      // Wikimedia rate-limits bursts; back off rather than report a false failure.
      if (response.status !== 429 || attempt === MAX_RETRIES) break;
      const waitSeconds = Number(response.headers.get('retry-after')) || 5 * (attempt + 1);
      await response.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
    const type = response.headers.get('content-type') || '';
    const body = await response.arrayBuffer();
    info = `${response.status} ${type.split(';')[0]} ${(body.byteLength / 1024).toFixed(0)} KB`;
    if (response.status !== 200) problems.push(`HTTP ${response.status}`);
    if (!type.startsWith('image/')) problems.push('not an image');
    if (!response.headers.get('access-control-allow-origin')) problems.push('no CORS header');
    if (body.byteLength > MAX_BYTES) problems.push('over 5 MB');
  } catch (error) {
    problems.push(error.name === 'TimeoutError' ? 'timeout' : error.message);
  }
  return {name, url, problems, info};
}

const results = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  results.push(...await Promise.all(targets.slice(i, i + CONCURRENCY).map(check)));
}

for (const {name, problems, info, url} of results) {
  const status = problems.length ? `FAIL ${problems.join(', ')}` : 'ok';
  console.log(`${name.padEnd(22)} ${status.padEnd(28)} ${info}`);
  if (problems.length) console.log(`${''.padEnd(22)} ${url}`);
}

const failed = results.filter((r) => r.problems.length);
console.log(`\n${results.length - failed.length}/${results.length} images ok`);
process.exitCode = failed.length ? 1 : 0;
