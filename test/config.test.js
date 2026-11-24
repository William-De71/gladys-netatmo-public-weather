import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readLanguage, DEFAULTS } from '../src/config.js';

test('defaults, bounds and choices', () => {
  const config = normalizeConfig();
  assert.equal(config.radiusKm, DEFAULTS.radiusKm);
  assert.equal(config.statistic, 'median');
  assert.equal(config.interval, 10);
  assert.equal(config.maxStations, 10);
  assert.equal(config.language, 'auto');
  assert.deepEqual(config.auth, { accessToken: '', refreshToken: '', expiresAt: 0, lost: false });
  const set = normalizeConfig({
    client_id: ' abc ',
    client_secret: 'def',
    radius_km: '2,5',
    statistic: 'mean',
    interval: '30',
    max_stations: '0',
    language: 'de',
    refresh_token: 'r',
    expires_at: '123',
    auth_lost: 'true',
  });
  assert.equal(set.clientId, 'abc');
  assert.equal(set.radiusKm, 2.5);
  assert.equal(set.statistic, 'mean');
  assert.equal(set.interval, 30);
  assert.equal(set.maxStations, 0);
  assert.equal(set.language, 'de');
  assert.deepEqual(set.auth, { accessToken: '', refreshToken: 'r', expiresAt: 123, lost: true });
  assert.equal(normalizeConfig({ radius_km: 99, interval: '7', statistic: 'max' }).radiusKm, 20);
  assert.equal(normalizeConfig({ interval: '7' }).interval, 10);
  assert.equal(normalizeConfig({ statistic: 'max' }).statistic, 'median');
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 3 }, 'en'), 'en');
});
