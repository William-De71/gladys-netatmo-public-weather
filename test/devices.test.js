import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';

import {
  buildAreaDevice,
  buildStationDevice,
  buildAreaStates,
  buildStationStates,
  targetOf,
} from '../src/device.js';
import { parseStations, summarize, isWet } from '../src/stations.js';
import { LANGUAGES } from '../src/i18n.js';
import { DIJON, DRY, NOW, NOW_S } from './helpers/fake-api.js';

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:netatmo:${type}:${id}`,
    feature: (key) => `ext:netatmo:${type}:${id}:${key}`,
  }),
};
const HOUSE = { selector: 'main-house', name: 'Maison' };
const stations = parseStations({ time_server: NOW_S, body: DRY }, DIJON, 3, NOW);

/**
 * @description The checks the host API does not do (fil 11005).
 * @param {object} device - A discovered device.
 */
function checkDevice(device) {
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  const ids = new Set();
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.ok(
      Object.values(DEVICE_FEATURE_CATEGORIES).includes(feature.category),
      feature.category,
    );
    if (feature.unit) {
      // The pairs were checked against DEVICE_FEATURE_UNITS_BY_CATEGORY of the core.
      assert.ok(Object.values(DEVICE_FEATURE_UNITS).includes(feature.unit), feature.unit);
    }
    assert.ok(!ids.has(feature.external_id));
    ids.add(feature.external_id);
    assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
    assert.ok(targetOf(feature.external_id));
  }
}

test('the neighborhood device: every measure, raining, stations, in every language', () => {
  for (const language of LANGUAGES) {
    const device = buildAreaDevice(fakeGladys, HOUSE, language);
    checkDevice(device);
    assert.equal(device.features.length, 10);
  }
  assert.equal(buildAreaDevice(fakeGladys, HOUSE, 'fr').name, 'Météo Netatmo autour de Maison');
});

test('a station device: the measures of its modules only, and the distance', () => {
  const [full, , windOnly] = stations.filter((s) => Object.keys(s.values).length > 0).slice(0, 3);
  const keys = (device) => device.features.map((f) => f.external_id.split(':').pop());
  const first = buildStationDevice(fakeGladys, full, 'en');
  checkDevice(first);
  assert.equal(first.external_id, 'ext:netatmo:station:70ee50000001');
  assert.equal(first.name, 'Netatmo Rue de la Liberté, Dijon');
  assert.deepEqual(keys(first), [
    'temperature',
    'humidity',
    'pressure',
    'rain_1h',
    'rain_24h',
    'raining',
    'distance',
  ]);
  assert.deepEqual(keys(buildStationDevice(fakeGladys, windOnly, 'en')), [
    'temperature',
    'humidity',
    'pressure',
    'rain_1h',
    'rain_24h',
    'wind_speed',
    'wind_gust',
    'wind_direction',
    'raining',
    'distance',
  ]);
});

test('states: only the values Netatmo gave, rounded', () => {
  const summary = summarize(stations, 'median');
  const area = buildAreaStates(fakeGladys, HOUSE, summary);
  const byKey = Object.fromEntries(
    area.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
  );
  assert.deepEqual(byKey, {
    temperature: 8.4,
    humidity: 79,
    pressure: 1015.1,
    rain_1h: 0,
    rain_24h: 1,
    wind_speed: 10,
    wind_gust: 20,
    wind_direction: 262,
    stations: 4,
    raining: 0,
  });
  const silent = stations[0];
  assert.deepEqual(
    buildStationStates(fakeGladys, silent, isWet(silent)).map((s) =>
      s.device_feature_external_id.split(':').pop(),
    ),
    ['distance'],
  );
});
