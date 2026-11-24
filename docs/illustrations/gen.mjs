// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The made-up stations around Dijon of the fake Netatmo API of the tests
// (test/helpers/fake-api.js), on Monday 23 November 2026, 15:00 in Paris, a
// shower going on, read by the real parser (src/stations.js) and drawn by the
// real widget builders (src/widgets.js). The 24 hours of the chart are made
// up with a seeded curve. Never real data.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildNeighborhoodWidget, buildStationsWidget, buildHistoryWidget } =
  await load('src/widgets.js');
const { parseStations, summarize } = await load('src/stations.js');
const { LANGUAGES } = await load('src/i18n.js');
const { NOW, NOW_S, TZ, DIJON, WET } = await load('test/helpers/fake-api.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Mulberry32: the same "random" curve on every run.
let seed = 20261123;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const MINUTE = 60_000;
const readings = [];
for (let at = NOW - 24 * 60 * MINUTE; at <= NOW; at += 10 * MINUTE) {
  const hours = ((at / (60 * MINUTE)) % 24) + 1;
  readings.push({
    at,
    values: {
      temperature:
        Math.round(
          (5.6 + 3.4 * Math.sin(((hours - 9) / 24) * 2 * Math.PI) + (random() - 0.5) * 0.3) * 10,
        ) / 10,
    },
  });
}
const stations = parseStations({ time_server: NOW_S, body: WET }, DIJON, 3, NOW);
const summary = summarize(stations, 'median');
const HOUSES = { en: 'Home', fr: 'Maison', de: 'Zuhause', es: 'Casa' };

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    neighborhood: buildNeighborhoodWidget({
      reading: { at: NOW, summary },
      house: { name: HOUSES[language] },
      radiusKm: 3,
      language,
      timeZone: TZ,
      now: NOW,
    }),
    stations: buildStationsWidget({ stations, language, now: NOW }),
    history: buildHistoryWidget({ readings, measure: 'temperature', language, now: NOW }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
