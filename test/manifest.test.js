// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, eventData } from '../src/events.js';
import { STATISTICS } from '../src/stations.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  DEFAULTS,
  INTERNAL_KEYS,
  INTERVALS,
  MAX_STATIONS,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Netatmo Public Weather');
  assert.equal(manifest.version, pkg.version);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/william-de71/gladys-netatmo-public-weather:${pkg.version}`,
  );
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-netatmo-public-weather/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-netatmo-public-weather');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: the Netatmo API, over HTTPS, one module', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/netatmo-api.js'), /'https:\/\/api\.netatmo\.com'/);
  for (const file of ['app', 'device', 'events', 'widgets', 'stations', 'store', 'config']) {
    assert.doesNotMatch(source(`../src/${file}.js`), /fetch\(|node:https?|node:net/, file);
  }
});

test('requires Gladys 5.3.0, reads the house position, asks nothing else', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.equal(manifest.location, true);
  assert.deepEqual(manifest.categories, ['environment']);
  for (const key of ['network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.equal(manifest.countries, undefined, 'Netatmo stations are everywhere');
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((x) => x.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((x) => x.key),
    Object.values(SCENE_ACTIONS),
  );
  assert.deepEqual(manifest.widgets.map((x) => x.key).sort(), Object.values(WIDGETS).sort());
  assert.deepEqual(
    manifest.actions.map((x) => x.key),
    Object.values(ACTIONS),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  assert.doesNotMatch(app, /onWidgetAction/, 'the only button is a link');
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  // The outputs declared are the ones the action returns.
  const outputs = byKey(manifest.scene_actions).get(SCENE_ACTIONS.READ_WEATHER).outputs;
  for (const { key } of outputs) {
    assert.match(app, new RegExp(`\\b${key}:`), key);
  }
});

test('the configuration of the code: defaults, bounds and choices', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('client_id').type, 'string');
  assert.equal(config.get('client_secret').type, 'secret');
  assert.equal(config.get(ACCOUNT_FIELD).type, 'oauth2');
  assert.equal(config.get('house').source, 'houses');
  assert.deepEqual(
    [config.get('radius_km').min, config.get('radius_km').max, config.get('radius_km').default],
    [1, 20, DEFAULTS.radiusKm],
  );
  assert.deepEqual(values(config.get('statistic')), Object.values(STATISTICS));
  assert.equal(config.get('statistic').default, DEFAULTS.statistic);
  assert.deepEqual(values(config.get('max_stations')), MAX_STATIONS.map(String));
  assert.equal(config.get('max_stations').default, String(DEFAULTS.maxStations));
  assert.deepEqual(values(config.get('interval')), INTERVALS.map(String));
  assert.equal(config.get('interval').default, String(DEFAULTS.interval));
  for (const key of Object.values(INTERNAL_KEYS)) {
    assert.equal(config.get(key), undefined, `${key} stays internal`);
  }
  assert.deepEqual(values(config.get('language')), [AUTO_LANGUAGE, ...LANGUAGES]);
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password'].includes(field.type), field.key);
  }
});

test('the trigger variables are the keys the events carry', () => {
  const carried = Object.keys(
    eventData(
      TRIGGERS.RAIN_STARTED,
      { wet: 1, gauges: 2, stations: 3, raining: true, values: {} },
      { house: { name: 'x' }, device: 'd', language: 'en' },
    ),
  ).sort();
  for (const trigger of manifest.scene_triggers) {
    assert.deepEqual(trigger.variables.map((v) => v.key).sort(), carried, trigger.key);
    assert.equal(trigger.fields, undefined);
  }
});

test('limits of the store: counts, timeouts, sizes', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const field of manifest.config_schema.filter((entry) => entry.description)) {
    for (const text of Object.values(field.description)) {
      assert.ok(text.length <= 1000, field.key);
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024);
  assert.equal(cover.readUInt16BE(0), 0xffd8);
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
});
