// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Netatmo weather around <house>" (`area`): the neighborhood summed up
// (median or mean of the public stations within the radius): temperature,
// humidity, pressure, rain of the last hour and of 24 hours, wind, gust,
// direction, raining (yes / no) and how many stations answered. Its features
// never depend on the stations found: changing the radius never asks the user
// to update the device.
//
// "Netatmo <street, town>" (`station`), the nearest public stations: the
// measures of their modules (outdoor, rain gauge, anemometer) and the
// distance from the house.
//
// External ids: `ext:netatmo-public-weather:area:<house selector>` and
// `...:station:<MAC address without colons>`. `should_poll` stays false: the
// integration reads on its own timer. A value Netatmo does not give is never
// published.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { FEATURE_KEYS, measureOf, round } from './measures.js';
import { placeOf } from './stations.js';

const DEVICE_TYPES = { AREA: 'area', STATION: 'station' };
const EXTRA = { RAINING: 'raining', STATIONS: 'stations', DISTANCE: 'distance' };
const MODULE_MEASURES = {
  station: ['pressure'],
  outdoor: ['temperature', 'humidity'],
  rain: ['rain_1h', 'rain_24h'],
  wind: ['wind_speed', 'wind_gust', 'wind_direction'],
};

/**
 * @description The id of a house in an external id.
 * @param {string} selector - The house selector.
 * @returns {string} "main-house".
 */
const houseKey = (selector) =>
  String(selector)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');

/**
 * @description The id of a station in an external id: its MAC address
 * without colons.
 * @param {string} mac - "70:ee:50:36:94:7c".
 * @returns {string} "70ee5036947c".
 */
const stationKey = (mac) =>
  String(mac)
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - One of DEVICE_TYPES.
 * @param {string} id - The house selector or the station MAC.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type, id) =>
  gladys.externalIds(type, type === DEVICE_TYPES.AREA ? houseKey(id) : stationKey(id));

/**
 * @description The type and id of a device (or feature) external id.
 * @param {unknown} externalId - The id.
 * @returns {{ type: string, id: string }|null} The target.
 */
function targetOf(externalId) {
  const match = /:(area|station):([a-z0-9_-]+?)(?::[a-z0-9_]+)?$/.exec(String(externalId ?? ''));
  return match ? { type: match[1], id: match[2] } : null;
}

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

/**
 * @description The feature of a measure.
 * @param {object} ids - The ids of the device.
 * @param {string} key - The measure.
 * @param {string} language - The language of the name.
 * @returns {object} The feature.
 */
function measureFeature(ids, key, language) {
  const measure = measureOf(key);
  return sensor({
    name: t(`measure_${key}`, language),
    external_id: ids.feature(key),
    ...measure.feature,
    min: measure.min,
    max: measure.max,
  });
}

const rainingFeature = (ids, language) =>
  sensor({
    name: t('featureRaining', language),
    external_id: ids.feature(EXTRA.RAINING),
    category: DEVICE_FEATURE_CATEGORIES.RAIN_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
  });

/**
 * @description The device of the neighborhood of a house.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} house - `{ selector, name }`.
 * @param {string} language - Language of the names.
 * @returns {object} The discovered device.
 */
function buildAreaDevice(gladys, house, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, house.selector);
  return {
    name: t('areaDeviceName', language, { house: house.name }),
    external_id: ids.device,
    model: 'Netatmo public weather',
    should_poll: false,
    params: [{ name: 'NETATMO_HOUSE', value: house.selector }],
    features: [
      ...FEATURE_KEYS.map((key) => measureFeature(ids, key, language)),
      rainingFeature(ids, language),
      sensor({
        name: t('featureStations', language),
        external_id: ids.feature(EXTRA.STATIONS),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: 1000,
      }),
    ],
  };
}

/**
 * @description The device of a public station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - A parsed station (`id`, `modules`, place).
 * @param {string} language - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, station, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, station.id);
  const keys = Object.entries(MODULE_MEASURES)
    .filter(([module]) => station.modules.includes(module))
    .flatMap(([, list]) => list);
  return {
    name: t('stationDeviceName', language, { place: placeOf(station) }),
    external_id: ids.device,
    model: 'Netatmo public weather station',
    should_poll: false,
    params: [{ name: 'NETATMO_STATION', value: station.id }],
    features: [
      ...FEATURE_KEYS.filter((key) => keys.includes(key)).map((key) =>
        measureFeature(ids, key, language),
      ),
      ...(station.modules.includes('rain') ? [rainingFeature(ids, language)] : []),
      sensor({
        name: t('featureDistance', language),
        external_id: ids.feature(EXTRA.DISTANCE),
        category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.KM,
        keep_history: false,
        min: 0,
        max: 50,
      }),
    ],
  };
}

/**
 * @description The states of a set of values.
 * @param {object} ids - The ids of the device.
 * @param {object} values - Measure key -> value.
 * @returns {Array<object>} The states.
 */
const measureStates = (ids, values) =>
  FEATURE_KEYS.filter((key) => Number.isFinite(values[key])).map((key) => ({
    device_feature_external_id: ids.feature(key),
    state: round(key, values[key]),
  }));

/**
 * @description The states of the neighborhood device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} house - `{ selector }`.
 * @param {object} summary - `summarize()`.
 * @returns {Array<object>} The states.
 */
function buildAreaStates(gladys, house, summary) {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, house.selector);
  const states = [
    ...measureStates(ids, summary.values),
    { device_feature_external_id: ids.feature(EXTRA.STATIONS), state: summary.stations },
  ];
  if (summary.raining !== null) {
    states.push({
      device_feature_external_id: ids.feature(EXTRA.RAINING),
      state: summary.raining ? 1 : 0,
    });
  }
  return states;
}

/**
 * @description The states of a station device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - A parsed station.
 * @param {boolean|null} wet - Whether it rains there.
 * @returns {Array<object>} The states.
 */
function buildStationStates(gladys, station, wet) {
  const ids = idsOf(gladys, DEVICE_TYPES.STATION, station.id);
  const states = [
    ...measureStates(ids, station.values),
    { device_feature_external_id: ids.feature(EXTRA.DISTANCE), state: station.distanceKm },
  ];
  if (wet !== null) {
    states.push({ device_feature_external_id: ids.feature(EXTRA.RAINING), state: wet ? 1 : 0 });
  }
  return states;
}

export {
  DEVICE_TYPES,
  EXTRA,
  MODULE_MEASURES,
  houseKey,
  stationKey,
  idsOf,
  targetOf,
  buildAreaDevice,
  buildStationDevice,
  buildAreaStates,
  buildStationStates,
};
