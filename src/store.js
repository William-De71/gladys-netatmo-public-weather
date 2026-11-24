// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in
// /data/netatmo-public-weather.json (the only writable place of the container):
//   - `signature` the area the memory below belongs to (house, radius): another
//                 area starts a new baseline, without events;
//   - `raining`   whether it rained at the last reading (null: not known yet);
//   - `dry`       dry readings in a row since it last rained (the end of the
//                 rain waits for two, so a short pause is not an end);
//   - `readings`  the weather of the neighborhood, the last 26 hours (the
//                 24-hour chart), 200 readings at most.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/netatmo-public-weather.json';
const HOUR_MS = 3600_000;
const KEEP_MS = 26 * HOUR_MS;
const MAX_READINGS = 200;
const EMPTY = () => ({ signature: null, raining: null, dry: 0, readings: [] });

/**
 * @description Merge a reading into the kept ones.
 * @param {object[]} kept - `[{ at, values }]`, sorted.
 * @param {{ at: number, values: object }} reading - The new one.
 * @param {number} now - Now (ms).
 * @returns {object[]} The readings to keep, sorted.
 */
function mergeReading(kept, reading, now) {
  const byTime = new Map();
  for (const item of [...(Array.isArray(kept) ? kept : []), reading]) {
    if (Number.isFinite(item?.at) && item.values && typeof item.values === 'object') {
      byTime.set(item.at, { at: item.at, values: { ...item.values } });
    }
  }
  return [...byTime.values()]
    .filter((item) => item.at > now - KEEP_MS && item.at <= now + HOUR_MS)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_READINGS);
}

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save, reset, addReading }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        store.data = {
          signature: typeof raw?.signature === 'string' ? raw.signature : null,
          raining: typeof raw?.raining === 'boolean' ? raw.raining : null,
          dry: Number.isInteger(raw?.dry) && raw.dry >= 0 ? raw.dry : 0,
          readings: mergeReading(raw?.readings, null, Date.now()),
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Start again for another area.
     * @param {string} signature - The area.
     */
    reset(signature) {
      store.data = { ...EMPTY(), signature };
    },
    /**
     * @description Keep a reading of the neighborhood.
     * @param {{ at: number, values: object }} reading - The reading.
     * @param {number} now - Now (ms).
     */
    addReading(reading, now) {
      store.data.readings = mergeReading(store.data.readings, reading, now);
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, KEEP_MS, MAX_READINGS, mergeReading, createStore };
