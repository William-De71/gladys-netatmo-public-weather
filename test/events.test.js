import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRIGGERS, detect, eventData } from '../src/events.js';
import { createStore } from '../src/store.js';
import { dataDir } from './helpers/fake-api.js';

const summary = (raining) => ({
  raining,
  wet: raining ? 2 : 0,
  gauges: 4,
  stations: 6,
  values: { rain_1h: raining ? 0.8 : 0, rain_24h: 3.4, temperature: 9.1 },
});

test('the first reading of an area is a baseline; one event per transition', () => {
  const store = createStore({ path: `${dataDir()}/s.json` });
  assert.deepEqual(detect(summary(true), store, 'a'), { baseline: true, event: null });
  assert.equal(detect(summary(true), store, 'a').event, null);
  assert.equal(detect(summary(false), store, 'a').event, null, 'one dry reading is a pause');
  assert.equal(detect(summary(true), store, 'a').event, null, 'still the same rain');
  assert.equal(detect(summary(false), store, 'a').event, null);
  assert.equal(detect(summary(false), store, 'a').event, TRIGGERS.RAIN_STOPPED);
  assert.equal(detect(summary(false), store, 'a').event, null);
  assert.equal(detect(summary(null), store, 'a').event, null, 'no gauge changes nothing');
  assert.equal(detect(summary(true), store, 'a').event, TRIGGERS.RAIN_STARTED);
  // Another area (radius, house): a new baseline.
  assert.deepEqual(detect(summary(false), store, 'b'), { baseline: true, event: null });
});

test('a baseline without a rain gauge waits for the first one', () => {
  const store = createStore({ path: `${dataDir()}/s.json` });
  detect(summary(null), store, 'a');
  assert.deepEqual(detect(summary(true), store, 'a'), { baseline: true, event: null });
});

test('the payload is flat, the summary in the language', () => {
  const data = eventData(TRIGGERS.RAIN_STARTED, summary(true), {
    house: { name: 'Maison' },
    device: 'ext:x:area:maison',
    language: 'fr',
  });
  assert.deepEqual(Object.keys(data).sort(), [
    'device',
    'house',
    'rain_1h',
    'rain_24h',
    'rain_gauges',
    'summary',
    'temperature',
    'wet_stations',
  ]);
  for (const value of Object.values(data)) {
    assert.ok(['string', 'number'].includes(typeof value));
  }
  assert.equal(
    data.summary,
    'Pluie autour de Maison : 2 pluviomètres sur 4, 0,8 mm sur la dernière heure.',
  );
});
