import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildNeighborhoodWidget,
  buildStationsWidget,
  buildHistoryWidget,
  messageContent,
  HISTORY_MEASURES,
} from '../src/widgets.js';
import { parseStations, summarize } from '../src/stations.js';
import { LANGUAGES } from '../src/i18n.js';
import { DIJON, DRY, WET, NOW, NOW_S, TZ } from './helpers/fake-api.js';

const HOUSE = { selector: 'main-house', name: 'Maison', ...DIJON };
const parse = (body) => parseStations({ time_server: NOW_S, body }, DIJON, 3, NOW);
const readings = Array.from({ length: 30 }, (_, i) => ({
  at: NOW - (29 - i) * 40 * 60_000,
  values: {
    temperature: 6 + Math.sin(i / 4) * 3,
    humidity: 70 + i,
    pressure: 1010 + i / 3,
    wind_speed: 5 + (i % 7),
    wind_gust: 12 + (i % 9),
    rain_1h: i > 20 ? 0.4 : 0,
    rain_24h: i > 20 ? (i - 20) * 0.4 : 0,
  },
}));

test('every widget content passes the validation of the SDK, in every language', () => {
  for (const language of LANGUAGES) {
    for (const body of [DRY, WET]) {
      const stations = parse(body);
      const contents = [
        buildNeighborhoodWidget({
          reading: { at: NOW, summary: summarize(stations, 'median') },
          house: HOUSE,
          radiusKm: 3,
          language,
          timeZone: TZ,
          now: NOW,
        }),
        buildStationsWidget({ stations, language, now: NOW }),
        ...Object.keys(HISTORY_MEASURES).map((measure) =>
          buildHistoryWidget({ readings, measure, language, now: NOW }),
        ),
      ];
      for (const content of contents) {
        assert.deepEqual(
          validateWidgetContent(content),
          [],
          `${language} ${JSON.stringify(content).slice(0, 80)}`,
        );
        assert.ok(content.components.length <= 8);
      }
    }
  }
  assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(400))), []);
});

test('the neighborhood: raining status first, six tiles at most, a caption', () => {
  const content = buildNeighborhoodWidget({
    reading: { at: NOW, summary: summarize(parse(WET), 'median') },
    house: HOUSE,
    radiusKm: 3,
    language: 'fr',
    timeZone: TZ,
    now: NOW,
  });
  const [status, ...rest] = content.components;
  assert.equal(status.type, 'status');
  assert.equal(status.items[0].label, 'Il pleut');
  assert.equal(status.items[0].value, '3/3 pluviomètres');
  assert.equal(rest.filter((c) => c.type === 'value').length, 6);
  assert.equal(rest.at(-1).text, '4 stations à 3 km de Maison · 15:00 · Netatmo');
});

test('no station, too few readings: a message', () => {
  const empty = buildNeighborhoodWidget({
    reading: { at: NOW, summary: summarize([], 'median') },
    house: HOUSE,
    radiusKm: 2,
    language: 'en',
    now: NOW,
  });
  assert.match(empty.components[0].text, /No public Netatmo station within 2 km/);
  assert.match(
    buildHistoryWidget({
      readings: readings.slice(0, 1),
      measure: 'rain',
      language: 'en',
      now: NOW,
    }).components[0].text,
    /Not enough readings/,
  );
  assert.match(
    buildStationsWidget({ stations: [], language: 'de', now: NOW }).components[0].text,
    /Keine/,
  );
});
