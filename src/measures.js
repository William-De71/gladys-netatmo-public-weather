// -----------------------------------------------------------------------------
// The measures of a public Netatmo station, as `getpublicdata` gives them.
// Netatmo already sends metric units whatever the account settings: degrees
// Celsius, %, mbar (= hPa, reduced to sea level), mm, km/h, degrees.
//
//   module         Netatmo field                      measure key
//   NAMain         res + type ["pressure"]            pressure
//   NAModule1      res + type ["temperature", ...]    temperature, humidity
//   NAModule3      rain_60min, rain_24h, rain_live    rain_1h, rain_24h, rain_live
//   NAModule2      wind_strength, gust_strength,      wind_speed, wind_gust,
//                  wind_angle                         wind_direction
//
// Each measure has an eternal `key` (the feature external id and the key in
// /data), its bounds (a value outside is a sensor fault, never used) and the
// shape of its Gladys feature. `rain_live` (the rain of the last few minutes)
// only decides whether it rains: it is never a feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

const C = DEVICE_FEATURE_CATEGORIES;
const T = DEVICE_FEATURE_TYPES;
const U = DEVICE_FEATURE_UNITS;

const MEASURES = [
  {
    key: 'temperature',
    min: -60,
    max: 60,
    unit: '°C',
    decimals: 1,
    feature: { category: C.TEMPERATURE_SENSOR, type: T.SENSOR.DECIMAL, unit: U.CELSIUS },
  },
  {
    key: 'humidity',
    min: 0,
    max: 100,
    unit: '%',
    decimals: 0,
    feature: { category: C.HUMIDITY_SENSOR, type: T.SENSOR.DECIMAL, unit: U.PERCENT },
  },
  {
    key: 'pressure',
    min: 850,
    max: 1100,
    unit: 'hPa',
    decimals: 1,
    feature: { category: C.PRESSURE_SENSOR, type: T.SENSOR.DECIMAL, unit: U.HECTO_PASCAL },
  },
  {
    key: 'rain_1h',
    min: 0,
    max: 300,
    unit: 'mm',
    decimals: 1,
    feature: {
      category: C.PRECIPITATION_SENSOR,
      type: T.PRECIPITATION_SENSOR.DECIMAL,
      unit: U.MILLIMETER_PER_HOUR,
    },
  },
  {
    // Netatmo's sliding 24 hours, not the calendar day.
    key: 'rain_24h',
    min: 0,
    max: 1000,
    unit: 'mm',
    decimals: 1,
    feature: {
      category: C.PRECIPITATION_SENSOR,
      type: T.PRECIPITATION_SENSOR.DECIMAL,
      unit: U.MILLIMETER_PER_DAY,
    },
  },
  {
    key: 'rain_live',
    min: 0,
    max: 100,
    unit: 'mm',
    decimals: 1,
    feature: null,
  },
  {
    key: 'wind_speed',
    min: 0,
    max: 400,
    unit: 'km/h',
    decimals: 0,
    feature: { category: C.SPEED_SENSOR, type: T.SPEED_SENSOR.DECIMAL, unit: U.KILOMETER_PER_HOUR },
  },
  {
    key: 'wind_gust',
    min: 0,
    max: 400,
    unit: 'km/h',
    decimals: 0,
    feature: { category: C.SPEED_SENSOR, type: T.SPEED_SENSOR.DECIMAL, unit: U.KILOMETER_PER_HOUR },
  },
  {
    // The angle category has no type of its own: the generic `integer`.
    key: 'wind_direction',
    min: 0,
    max: 360,
    unit: '°',
    decimals: 0,
    feature: { category: C.ANGLE_SENSOR, type: T.SENSOR.INTEGER, unit: U.DEGREE },
  },
];

const BY_KEY = new Map(MEASURES.map((measure) => [measure.key, measure]));
const FEATURE_KEYS = MEASURES.filter((measure) => measure.feature).map((measure) => measure.key);
const RAIN_KEYS = ['rain_1h', 'rain_24h', 'rain_live'];
const WIND_KEYS = ['wind_speed', 'wind_gust', 'wind_direction'];

/**
 * @description A measure by its key.
 * @param {string} key - The key.
 * @returns {object|undefined} The measure.
 */
const measureOf = (key) => BY_KEY.get(key);

/**
 * @description A value rounded to the decimals of its measure.
 * @param {string} key - The measure.
 * @param {number} value - The value.
 * @returns {number} The rounded value.
 */
function round(key, value) {
  const factor = 10 ** (measureOf(key)?.decimals ?? 1);
  return Math.round(value * factor) / factor;
}

/**
 * @description A value Netatmo sent, kept when it is a number within the
 * bounds of its measure.
 * @param {string} key - The measure.
 * @param {unknown} raw - The value.
 * @returns {number|null} The value, null when absent or out of bounds.
 */
function valid(key, raw) {
  const measure = measureOf(key);
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
    return null;
  }
  const value = Number(raw);
  if (!measure || !Number.isFinite(value) || value < measure.min || value > measure.max) {
    return null;
  }
  return value;
}

export { MEASURES, FEATURE_KEYS, RAIN_KEYS, WIND_KEYS, measureOf, round, valid };
