import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STATISTICS,
  boxAround,
  distanceKm,
  parseStations,
  summarize,
  windDirection,
  placeOf,
} from '../src/stations.js';
import { DIJON, DRY, WET, NOW, NOW_S, station } from './helpers/fake-api.js';

const answer = (body) => ({ status: 'ok', time_server: NOW_S, body });

test('the rectangle holds the circle of the radius', () => {
  const box = boxAround(DIJON, 3);
  assert.ok(box.lat_ne > DIJON.latitude && box.lat_sw < DIJON.latitude);
  assert.ok(box.lon_ne > DIJON.longitude && box.lon_sw < DIJON.longitude);
  // The middle of each side is 3 km away.
  assert.ok(
    Math.abs(distanceKm(DIJON.latitude, DIJON.longitude, box.lat_ne, DIJON.longitude) - 3) < 0.01,
  );
  assert.ok(
    Math.abs(distanceKm(DIJON.latitude, DIJON.longitude, DIJON.latitude, box.lon_ne) - 3) < 0.01,
  );
});

test('stations: within the circle, nearest first, the latest measures, stale ones dropped', () => {
  const stations = parseStations(answer(DRY), DIJON, 3, NOW);
  assert.deepEqual(
    stations.map((s) => s.id),
    [
      '70:ee:50:00:00:05',
      '70:ee:50:00:00:01',
      '70:ee:50:00:00:02',
      '70:ee:50:00:00:03',
      '70:ee:50:00:00:04',
    ],
  );
  const first = stations.find((s) => s.id === '70:ee:50:00:00:01');
  assert.deepEqual(first.values, {
    pressure: 1015.2,
    temperature: 8.2,
    humidity: 80,
    rain_1h: 0,
    rain_24h: 1.2,
    rain_live: 0,
  });
  assert.deepEqual(first.modules, ['outdoor', 'rain', 'station']);
  assert.equal(first.at, (NOW_S - 300) * 1000);
  assert.equal(placeOf(first), 'Rue de la Liberté, Dijon');
  // Two hours without a measure: the station is there, without values.
  assert.deepEqual(stations[0].values, {});
});

test('bad values are dropped: out of bounds, not numbers, a wrong id or position', () => {
  const broken = station({
    mac: '70:ee:50:00:00:09',
    temperature: 120,
    humidity: 'x',
    pressure: 1013,
  });
  const stations = parseStations(
    answer([broken, { _id: 'nope', place: { location: [5, 47] } }, { _id: '70:ee:50:00:00:0a' }]),
    DIJON,
    3,
    NOW,
  );
  assert.equal(stations.length, 1);
  assert.deepEqual(stations[0].values, { pressure: 1013 });
});

test('the neighborhood: the median ignores the station in the sun, the mean does not', () => {
  const stations = parseStations(answer(DRY), DIJON, 3, NOW);
  const median = summarize(stations, STATISTICS.MEDIAN);
  assert.equal(median.values.temperature, 8.4);
  assert.equal(median.values.humidity, 79);
  assert.equal(median.stations, 4);
  assert.equal(median.gauges, 3);
  assert.equal(median.wet, 0);
  assert.equal(median.raining, false);
  assert.equal(median.values.wind_direction, 262);
  const mean = summarize(stations, STATISTICS.MEAN);
  assert.equal(mean.values.temperature, 11.4);
});

test('it rains when a third of the rain gauges (one at least) are wet', () => {
  const wet = summarize(parseStations(answer(WET), DIJON, 3, NOW), STATISTICS.MEDIAN);
  assert.equal(wet.raining, true);
  assert.equal(wet.wet, 3);
  assert.equal(wet.values.rain_1h, 0.6);
  const none = summarize(parseStations(answer([DRY[1]]), DIJON, 3, NOW), STATISTICS.MEDIAN);
  assert.equal(none.raining, null, 'no rain gauge: unknown');
  assert.equal(summarize([], STATISTICS.MEDIAN).stations, 0);
});

test('the wind direction is the vector mean, across north', () => {
  const values = (angle, speed) => ({ values: { wind_direction: angle, wind_speed: speed } });
  assert.equal(windDirection([values(350, 10), values(10, 10)]), 0);
  assert.equal(windDirection([values(90, 10), values(180, 0)]), 90);
  assert.equal(windDirection([values(90, 0)]), null);
});
