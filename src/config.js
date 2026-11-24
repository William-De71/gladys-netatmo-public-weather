// -----------------------------------------------------------------------------
// Configuration of the Netatmo Public Weather integration.
//
// Fields of the config_schema:
//   - `client_id` / `client_secret`  the user's own Netatmo Connect application
//                 (dev.netatmo.com; the secret is a `secret`: never sent back
//                 to the UI, never logged);
//   - `netatmo_account`  the Connect button (`oauth2`): no value of its own;
//   - `house`     the house of Gladys whose position is the center
//                 (`source: "houses"`); empty: the first house with a position;
//   - `radius_km` how far around the house, 1 to 20 km;
//   - `statistic` how the stations are summed up: `median` or `mean`;
//   - `max_stations`  how many nearby stations are offered as devices;
//   - `interval`  minutes between two readings: 10, 15, 30 or 60;
//   - `language`  language of the texts Gladys does not ask for in a language
//                 (device names, scene texts): `auto` follows the language of
//                 the last widget request.
//
// Internal keys, outside the config_schema (never shown in the UI), written
// by the integration with setConfig(): the tokens, the OAuth state of the
// connection in progress, and the language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { STATISTICS } from './stations.js';

const ACCOUNT_FIELD = 'netatmo_account';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  expiresAt: 'expires_at',
  authLost: 'auth_lost',
  oauthState: 'oauth_state',
  oauthRedirectUri: 'oauth_redirect_uri',
  language: 'last_language',
};
const INTERVALS = [10, 15, 30, 60];
const MAX_STATIONS = [0, 5, 10, 20];
const DEFAULTS = { radiusKm: 3, interval: 10, maxStations: 10, statistic: STATISTICS.MEDIAN };

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description A number within bounds, or the default.
 * @param {unknown} raw - The value.
 * @param {number} min - The minimum.
 * @param {number} max - The maximum.
 * @param {number} fallback - The default.
 * @returns {number} The number, one decimal at most.
 */
function readNumber(raw, min, max, fallback) {
  const value = Number(readString(raw).replace(',', '.') || NaN);
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 10) / 10))
    : fallback;
}

/**
 * @description One of the allowed values, or the default.
 * @param {unknown} raw - The value.
 * @param {number[]} allowed - The values.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  const text = readString(raw);
  const value = text === '' ? NaN : Number(text);
  return allowed.includes(value) ? value : fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The configuration.
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const statistic = readString(config.statistic);
  return {
    clientId: readString(config.client_id),
    clientSecret: readString(config.client_secret),
    house: readString(config.house) || null,
    radiusKm: readNumber(config.radius_km, 1, 20, DEFAULTS.radiusKm),
    statistic: Object.values(STATISTICS).includes(statistic) ? statistic : DEFAULTS.statistic,
    maxStations: readChoice(config.max_stations, MAX_STATIONS, DEFAULTS.maxStations),
    interval: readChoice(config.interval, INTERVALS, DEFAULTS.interval),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
    auth: {
      accessToken: readString(config[INTERNAL_KEYS.accessToken]),
      refreshToken: readString(config[INTERNAL_KEYS.refreshToken]),
      expiresAt: Number(config[INTERNAL_KEYS.expiresAt]) || 0,
      lost: config[INTERNAL_KEYS.authLost] === true || config[INTERNAL_KEYS.authLost] === 'true',
    },
    pendingAuth: {
      state: readString(config[INTERNAL_KEYS.oauthState]),
      redirectUri: readString(config[INTERNAL_KEYS.oauthRedirectUri]),
    },
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  MAX_STATIONS,
  DEFAULTS,
  normalizeConfig,
  readLanguage,
};
