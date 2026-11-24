// A fake Netatmo Connect API for the tests, served through the `fetch` option
// of the integration. The answers follow the shapes of `getpublicdata` (the
// fixture `fixtures/getpublicdata.json` of pyatmo, MIT) and the error answers
// captured from the real API on 2026-11-24 (no token: 400 code 1, wrong token:
// 403 code 2, wrong client: 400 invalid_client). The stations around Dijon
// are made up. Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Monday 23 November 2026, 15:00 in Paris.
const NOW = Date.parse('2026-11-23T14:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const TZ = 'Europe/Paris';
// Dijon, place Darcy.
const DIJON = { latitude: 47.3226, longitude: 5.0333 };
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary folder standing for /data.
 * @returns {string} The path.
 */
const dataDir = () => mkdtempSync(join(tmpdir(), 'netatmo-public-'));

/**
 * @description One public station, as getpublicdata gives it.
 * @param {object} options - Its measures.
 * @returns {object} The station.
 */
function station({
  mac,
  dLat = 0,
  dLon = 0,
  temperature,
  humidity,
  pressure,
  rain,
  wind,
  age = 300,
  city = 'Dijon',
  street,
}) {
  const at = NOW_S - age;
  const measures = {};
  const modules = [];
  const types = {};
  if (pressure !== undefined) {
    measures[mac] = { res: { [at]: [pressure] }, type: ['pressure'] };
  }
  if (temperature !== undefined) {
    const id = `02:00:00${mac.slice(8)}`;
    measures[id] = {
      res: { [at - 600]: [temperature - 1, humidity], [at]: [temperature, humidity] },
      type: ['temperature', 'humidity'],
    };
    modules.push(id);
    types[id] = 'NAModule1';
  }
  if (rain) {
    const id = `05:00:00${mac.slice(8)}`;
    measures[id] = {
      rain_60min: rain[0],
      rain_24h: rain[1],
      rain_live: rain[2],
      rain_timeutc: at,
    };
    modules.push(id);
    types[id] = 'NAModule3';
  }
  if (wind) {
    const id = `06:00:00${mac.slice(8)}`;
    measures[id] = {
      wind_strength: wind[0],
      wind_angle: wind[1],
      gust_strength: wind[2],
      gust_angle: wind[1],
      wind_timeutc: at,
    };
    modules.push(id);
    types[id] = 'NAModule2';
  }
  return {
    _id: mac,
    place: {
      location: [DIJON.longitude + dLon, DIJON.latitude + dLat],
      timezone: 'Europe/Paris',
      country: 'FR',
      altitude: 245,
      city,
      ...(street ? { street } : {}),
    },
    mark: 10,
    measures,
    modules,
    module_types: types,
  };
}

/** Dry stations around Dijon. */
const DRY = [
  station({
    mac: '70:ee:50:00:00:01',
    dLat: 0.005,
    temperature: 8.2,
    humidity: 80,
    pressure: 1015.2,
    rain: [0, 1.2, 0],
    street: 'Rue de la Liberté',
  }),
  station({
    mac: '70:ee:50:00:00:02',
    dLon: 0.01,
    temperature: 8.6,
    humidity: 78,
    pressure: 1014.8,
    wind: [12, 270, 25],
  }),
  station({
    mac: '70:ee:50:00:00:03',
    dLat: -0.01,
    temperature: 21.0, // in the sun: the median ignores it
    humidity: 60,
    pressure: 1015.0,
    rain: [0, 0.8, 0],
    wind: [8, 250, 15],
    street: 'Avenue Victor Hugo',
  }),
  station({
    mac: '70:ee:50:00:00:04',
    dLat: 0.012,
    dLon: -0.01,
    temperature: 7.9,
    humidity: 82,
    pressure: 1015.6,
    rain: [0, 1.0, 0],
  }),
  // Offline for two hours: not used.
  station({
    mac: '70:ee:50:00:00:05',
    dLon: -0.005,
    temperature: 2,
    humidity: 99,
    pressure: 990,
    age: 7200,
  }),
  // In the corner of the rectangle, outside the circle of 3 km.
  station({ mac: '70:ee:50:00:00:06', dLat: 0.025, dLon: 0.035, temperature: 9, humidity: 75 }),
];

/** The same stations, raining. */
const WET = DRY.map((item) => {
  const copy = structuredClone(item);
  for (const module of Object.values(copy.measures)) {
    if ('rain_60min' in module) {
      module.rain_60min = 0.6;
      module.rain_live = 0.2;
      module.rain_24h += 0.6;
    }
  }
  return copy;
});

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * @description The fake API: tokens rotate, getpublicdata answers `stations`.
 * @param {object} [options] - `{ stations, refreshError, exchangeError, expiredOnce }`.
 * @returns {Function} A fetch, with `calls`, `setStations`, `tokens`.
 */
function fakeNetatmo({ stations = DRY, refreshError, exchangeError, expiredOnce = false } = {}) {
  let current = stations;
  let serial = 0;
  let validAccess = 'access-0';
  let validRefresh = 'refresh-0';
  let expired = expiredOnce;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
    calls.push({
      path: pathname,
      params: Object.fromEntries(searchParams),
      form,
      headers: init.headers,
    });
    if (pathname === '/oauth2/token') {
      if (form.client_id !== 'client' || form.client_secret !== 'secret') {
        return json(400, { error: 'invalid_client' });
      }
      if (form.grant_type === 'authorization_code') {
        if (exchangeError) return json(400, { error: exchangeError });
      } else if (refreshError) {
        return json(400, { error: refreshError });
      } else if (form.refresh_token !== validRefresh) {
        return json(400, { error: 'invalid_grant' });
      }
      serial += 1;
      validAccess = `access-${serial}`;
      validRefresh = `refresh-${serial}`;
      return json(200, {
        access_token: validAccess,
        refresh_token: validRefresh,
        expires_in: 10800,
        scope: ['read_station'],
      });
    }
    if (pathname === '/api/getpublicdata') {
      const auth = init.headers?.Authorization ?? '';
      if (!auth) return json(400, { error: { code: 1, message: 'Access token is missing' } });
      if (expired) {
        expired = false;
        return json(403, { error: { code: 3, message: 'Access token expired' } });
      }
      if (auth !== `Bearer ${validAccess}`) {
        return json(403, { error: { code: 2, message: 'Invalid access token' } });
      }
      return json(200, { status: 'ok', time_server: NOW_S, time_exec: 0.1, body: current });
    }
    return json(404, { error: { code: 404, message: 'Not found' } });
  };
  fetchImpl.calls = calls;
  fetchImpl.setStations = (next) => {
    current = next;
  };
  fetchImpl.tokens = () => ({ access: validAccess, refresh: validRefresh });
  return fetchImpl;
}

export { NOW, NOW_S, TZ, DIJON, DRY, WET, silent, dataDir, station, fakeNetatmo };
