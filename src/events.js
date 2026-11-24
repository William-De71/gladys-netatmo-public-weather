// -----------------------------------------------------------------------------
// Scene triggers of the integration: the rain starts, the rain stops, in the
// neighborhood of the house.
//
// One event per transition, never a snapshot: the first reading of an area
// (house, radius) is a baseline; the rain starts when the stations say it
// rains and the reading before said it did not; it stops after two dry
// readings in a row (a short pause between two showers is not an end). A
// reading without any rain gauge in the radius changes nothing. A scene
// action or a widget never fires an event.
// -----------------------------------------------------------------------------

import { t, formatNumber } from './i18n.js';

const TRIGGERS = { RAIN_STARTED: 'rain_started', RAIN_STOPPED: 'rain_stopped' };
const DRY_READINGS_TO_STOP = 2;

/**
 * @description The transition of a reading, and the store updated.
 * @param {object} summary - `summarize()` of the reading.
 * @param {object} store - The store (`data.signature`, `raining`, `dry`).
 * @param {string} signature - The area of the reading.
 * @returns {{ baseline: boolean, event: string|null }} What happened.
 */
function detect(summary, store, signature) {
  const { data } = store;
  if (data.signature !== signature) {
    store.reset(signature);
    store.data.raining = summary.raining;
    return { baseline: true, event: null };
  }
  if (summary.raining === null) {
    return { baseline: false, event: null };
  }
  if (data.raining === null) {
    data.raining = summary.raining;
    data.dry = 0;
    return { baseline: true, event: null };
  }
  if (summary.raining) {
    data.dry = 0;
    if (!data.raining) {
      data.raining = true;
      return { baseline: false, event: TRIGGERS.RAIN_STARTED };
    }
    return { baseline: false, event: null };
  }
  data.dry += 1;
  if (data.raining && data.dry >= DRY_READINGS_TO_STOP) {
    data.raining = false;
    return { baseline: false, event: TRIGGERS.RAIN_STOPPED };
  }
  return { baseline: false, event: null };
}

/**
 * @description The flat payload of a rain event.
 * @param {string} event - One of TRIGGERS.
 * @param {object} summary - `summarize()` of the reading.
 * @param {object} options - `{ house, device, language }`.
 * @returns {object} The data: scalars only.
 */
function eventData(event, summary, { house, device, language }) {
  const number = (key) => (Number.isFinite(summary.values[key]) ? summary.values[key] : null);
  const rain = number('rain_1h');
  return {
    house: house.name,
    device,
    wet_stations: summary.wet,
    rain_gauges: summary.gauges,
    rain_1h: rain,
    rain_24h: number('rain_24h'),
    temperature: number('temperature'),
    summary: t(
      event === TRIGGERS.RAIN_STARTED ? 'summaryRainStarted' : 'summaryRainStopped',
      language,
      {
        house: house.name,
        wet: summary.wet,
        gauges: summary.gauges,
        rain: formatNumber(rain ?? 0, language),
        rain24: formatNumber(number('rain_24h') ?? 0, language),
      },
    ),
  };
}

export { TRIGGERS, DRY_READINGS_TO_STOP, detect, eventData };
