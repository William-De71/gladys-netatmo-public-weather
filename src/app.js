// -----------------------------------------------------------------------------
// The Netatmo Public Weather integration: every handler, registered on a
// Gladys client.
//
// Brings the public Netatmo weather stations around a house of Gladys
// (`getpublicdata`, Netatmo Connect API) into Gladys, with the user's own
// Netatmo Connect application and the OAuth2 flow relayed by Gladys:
//   - devices (device.js): the weather of the neighborhood (median or mean of
//     the stations within the radius) and the nearest stations;
//   - scene triggers (events.js): the rain starts, the rain stops;
//   - scene action: read the neighborhood now, with another radius;
//   - dashboard widgets (widgets.js): neighborhood, stations, last 24 hours.
//
// Netatmo has no push for public data: the integration reads it on its own
// timer (10 to 60 min, one request per reading; Netatmo allows 500 an hour).
// Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake Netatmo API (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  readLanguage,
} from './config.js';
import { createNetatmoClient, NetatmoError, ERROR_KINDS } from './netatmo-api.js';
import { boxAround, parseStations, summarize, isWet } from './stations.js';
import { createStore, DEFAULT_PATH } from './store.js';
import {
  DEVICE_TYPES,
  idsOf,
  targetOf,
  buildAreaDevice,
  buildStationDevice,
  buildAreaStates,
  buildStationStates,
} from './device.js';
import { TRIGGERS, detect, eventData } from './events.js';
import {
  WIDGETS,
  TTL_SECONDS,
  messageContent,
  buildNeighborhoodWidget,
  buildStationsWidget,
  buildHistoryWidget,
} from './widgets.js';
import { measureOf, round } from './measures.js';
import { defaultTimeZone } from './time.js';
import { LANGUAGES, t, all, formatNumber, compassPoint } from './i18n.js';

const ACTIONS = { CHECK: 'check' };
const SCENE_ACTIONS = { READ_WEATHER: 'read_weather' };
const MINUTE_MS = 60_000;
const RETRY_MS = 15 * MINUTE_MS;
// Refresh the access token this long before it expires.
const TOKEN_MARGIN_MS = 5 * MINUTE_MS;
const {
  name: NAME,
  version: VERSION,
  homepage: HOMEPAGE,
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * @description The message key and values of a failure.
 * @param {Error} err - A NetatmoError, or a house problem (`kind`).
 * @returns {{ key: string, values: object }} The message.
 */
function problemOf(err) {
  switch (err?.kind) {
    case 'no_house':
      return { key: 'statusNoHouse', values: {} };
    case 'house':
      return { key: 'statusHouseNotLocated', values: { house: err.house } };
    case ERROR_KINDS.NO_CLIENT:
      return { key: 'statusNoClient', values: {} };
    case ERROR_KINDS.NOT_CONNECTED:
      return { key: 'statusNotConnected', values: {} };
    case ERROR_KINDS.AUTH_LOST:
    case ERROR_KINDS.TOKEN:
      return { key: 'statusAuthLost', values: {} };
    case ERROR_KINDS.RATE_LIMIT:
      return { key: 'statusRateLimited', values: {} };
    case ERROR_KINDS.UNREACHABLE:
      return { key: 'statusUnreachable', values: {} };
    default:
      return {
        key: 'statusApiError',
        values: { detail: String(err?.message ?? err).slice(0, 120) },
      };
  }
}

// Failures that wait for the user (configuration, Connect), not for a timer.
const WAITS_FOR_USER = [
  ERROR_KINDS.NO_CLIENT,
  ERROR_KINDS.NOT_CONNECTED,
  ERROR_KINDS.AUTH_LOST,
  ERROR_KINDS.TOKEN,
];

/**
 * @description "Temperature 12.3 °C, humidity 85 %, …": the weather in words.
 * @param {object} summary - `summarize()`.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function weatherText(summary, language) {
  const { values } = summary;
  const show = (key) =>
    `${formatNumber(round(key, values[key]), language, measureOf(key).decimals)} ${measureOf(key).unit}`;
  const parts = [];
  if (Number.isFinite(values.temperature)) parts.push(show('temperature'));
  if (Number.isFinite(values.humidity)) parts.push(show('humidity'));
  if (Number.isFinite(values.pressure)) parts.push(show('pressure'));
  if (Number.isFinite(values.wind_speed)) {
    parts.push(`${show('wind_speed')} ${compassPoint(values.wind_direction, language)}`.trim());
  }
  if (summary.raining !== null) {
    parts.push(
      summary.raining
        ? `${t('weatherRaining', language)} (${show('rain_1h')})`
        : t('weatherDry', language),
    );
  }
  return parts.join(', ');
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {string} [options.baseUrl] - The Netatmo API root.
 * @param {() => number} [options.now] - Clock.
 * @param {string} [options.dataDir] - Where /data files go.
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @param {boolean} [options.timer] - Read on a timer (false in the tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    baseUrl,
    now = () => Date.now(),
    dataDir = '/data',
    timeZone = defaultTimeZone(),
    timer = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // The tokens in memory: Netatmo rotates the refresh token, memory is the
  // freshest copy (a store write may fail while Gladys restarts).
  let auth = { ...config.auth };
  let pendingAuth = { state: '', redirectUri: '' };
  let refreshing = null;
  let language = 'en';
  let createdDevices = new Set();
  let lastStatus = null;
  let house = null;
  let stations = [];
  let reading = null;
  let offered = null;
  let roundTimer = null;
  let running = null;
  let stopped = false;
  const inflight = new Map();

  const client = createNetatmoClient({
    baseUrl,
    fetchImpl,
    userAgent: `${NAME}/${VERSION} (+${HOMEPAGE})`,
  });
  const store = createStore({
    path: dataDir === '/data' ? DEFAULT_PATH : `${dataDir}/netatmo-public-weather.json`,
    logger,
  });

  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);
  const signatureOf = (target) =>
    JSON.stringify([target.selector, target.latitude, target.longitude, config.radiusKm]);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  // --- Tokens -------------------------------------------------------------------

  /**
   * @description Keep new tokens, in memory then in the configuration.
   * @param {object} tokens - `{ accessToken, refreshToken, expiresAt }`.
   * @returns {Promise<void>}
   */
  async function saveTokens(tokens) {
    auth = { ...tokens, lost: false };
    try {
      await gladys.setConfig({
        [INTERNAL_KEYS.accessToken]: tokens.accessToken,
        [INTERNAL_KEYS.refreshToken]: tokens.refreshToken,
        [INTERNAL_KEYS.expiresAt]: tokens.expiresAt,
        [INTERNAL_KEYS.authLost]: false,
      });
    } catch (err) {
      // The tokens in memory are valid: the next refresh stores them again.
      logger.warn(`Unable to store the Netatmo tokens: ${err.message}`);
    }
  }

  /**
   * @description Netatmo refused the tokens for good: wait for Connect.
   * @returns {Promise<void>}
   */
  async function loseAuth() {
    auth = { accessToken: '', refreshToken: '', expiresAt: 0, lost: true };
    await gladys
      .setConfig({
        [INTERNAL_KEYS.accessToken]: '',
        [INTERNAL_KEYS.refreshToken]: '',
        [INTERNAL_KEYS.expiresAt]: 0,
        [INTERNAL_KEYS.authLost]: true,
      })
      .catch((err) => logger.warn(`Unable to clear the Netatmo tokens: ${err.message}`));
  }

  /**
   * @description Refresh the access token, one refresh at a time (the refresh
   * token is used once: two refreshes at once would lose the connection).
   * @returns {Promise<void>}
   */
  function refreshTokens() {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const tokens = await client.refresh(
            {
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              refreshToken: auth.refreshToken,
            },
            now(),
          );
          await saveTokens(tokens);
          logger.debug('Netatmo access token refreshed');
        } catch (err) {
          if (err.kind === ERROR_KINDS.AUTH_LOST || err.kind === ERROR_KINDS.API) {
            logger.warn(`Netatmo refused the refresh token: ${err.message}`);
            await loseAuth();
            throw new NetatmoError(ERROR_KINDS.AUTH_LOST, err.message);
          }
          throw err;
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  /**
   * @description A call that needs an access token: refreshed when about to
   * expire, and once more when Netatmo says it expired.
   * @param {(token: string) => Promise<object>} call - The call.
   * @returns {Promise<object>} The answer.
   */
  async function withToken(call) {
    if (!config.clientId || !config.clientSecret) {
      throw new NetatmoError(ERROR_KINDS.NO_CLIENT, 'No Netatmo application configured');
    }
    if (auth.lost) {
      throw new NetatmoError(ERROR_KINDS.AUTH_LOST, 'Netatmo connection lost');
    }
    if (!auth.refreshToken) {
      throw new NetatmoError(ERROR_KINDS.NOT_CONNECTED, 'Netatmo account not connected');
    }
    if (!auth.accessToken || auth.expiresAt - now() < TOKEN_MARGIN_MS) {
      await refreshTokens();
    }
    try {
      return await call(auth.accessToken);
    } catch (err) {
      if (err.kind !== ERROR_KINDS.TOKEN) {
        throw err;
      }
      await refreshTokens();
      return call(auth.accessToken);
    }
  }

  // --- House --------------------------------------------------------------------

  /**
   * @description The house of the configuration, with its position.
   * @returns {Promise<object>} `{ selector, name, latitude, longitude }`.
   */
  async function resolveHouse() {
    const houses = await gladys.getHouses().catch((err) => {
      logger.warn(`Unable to read the houses: ${err.message}`);
      return [];
    });
    const located = (candidate) =>
      typeof candidate?.latitude === 'number' && typeof candidate?.longitude === 'number';
    if (config.house) {
      const chosen = houses.find((candidate) => candidate.selector === config.house);
      if (!located(chosen)) {
        throw Object.assign(new Error('House without a position'), {
          kind: 'house',
          house: chosen?.name ?? config.house,
        });
      }
      return chosen;
    }
    const first = houses.find(located);
    if (!first) {
      throw Object.assign(new Error('No house with a position'), { kind: 'no_house' });
    }
    return first;
  }

  /**
   * @description The stations around a house, read from Netatmo.
   * @param {object} target - The house.
   * @param {number} radiusKm - The radius.
   * @returns {Promise<object[]>} The stations, nearest first.
   */
  async function readStations(target, radiusKm) {
    const answer = await withToken((token) =>
      client.publicData(boxAround(target, radiusKm), token),
    );
    return parseStations(answer, target, radiusKm, now());
  }

  // --- Devices ------------------------------------------------------------------

  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description The stations offered as devices: the nearest ones that give
   * a measure, plus the ones already created (never taken away).
   * @returns {object[]} The stations.
   */
  function offeredStations() {
    const created = stations.filter((station) =>
      createdDevices.has(idsOf(gladys, DEVICE_TYPES.STATION, station.id).device),
    );
    const nearest = stations
      .filter((station) => Object.keys(station.values).length > 0)
      .slice(0, config.maxStations);
    return [...new Map([...nearest, ...created].map((station) => [station.id, station])).values()];
  }

  /**
   * @description Offer the neighborhood and the nearest stations on the
   * Discovery screen, when the list changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<void>}
   */
  async function offerDevices(force = false) {
    if (!house) {
      return;
    }
    const lang = textLanguage();
    const devices = [
      buildAreaDevice(gladys, house, lang),
      ...offeredStations().map((station) => buildStationDevice(gladys, station, lang)),
    ];
    const signature = JSON.stringify(devices);
    if (!force && signature === offered) {
      return;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      offered = signature;
    } catch (err) {
      logger.warn(`Unable to offer the devices: ${err.message}`);
    }
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    if (!reading) {
      return;
    }
    const states = [
      ...buildAreaStates(gladys, house, reading.summary),
      ...stations.flatMap((station) => buildStationStates(gladys, station, isWet(station))),
    ].filter((state) => {
      const target = targetOf(state.device_feature_external_id);
      if (!target) {
        return false;
      }
      const device =
        target.type === DEVICE_TYPES.AREA
          ? idsOf(gladys, DEVICE_TYPES.AREA, house.selector).device
          : idsOf(gladys, DEVICE_TYPES.STATION, target.id).device;
      return createdDevices.has(device);
    });
    if (states.length > 0) {
      // Once every 30 min a value that did not move is sent again, so a
      // chart never looks broken on a still day.
      await gladys
        .publishChangedStates(states, { heartbeat: 30 * MINUTE_MS })
        .catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));
    }
  }

  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) =>
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch(() => {}),
    );
  }

  // --- The reading --------------------------------------------------------------

  /**
   * @description Read Netatmo once: the house, the stations around, the
   * neighborhood; then the event, states, devices, status.
   * @returns {Promise<object>} The reading.
   */
  async function readNow() {
    try {
      house = await resolveHouse();
      stations = await readStations(house, config.radiusKm);
      const summary = summarize(stations, config.statistic);
      reading = { at: now(), summary };
      const { baseline, event } = detect(summary, store, signatureOf(house));
      if (summary.stations > 0) {
        store.addReading({ at: reading.at, values: summary.values }, now());
      }
      await store.save();
      logger.info(
        `Netatmo: ${summary.stations} stations within ${config.radiusKm} km of ${house.name}` +
          `${baseline ? ' (baseline)' : ''}${event ? `, ${event}` : ''}`,
      );
      if (event) {
        // Payload texts in the language of the texts; never fired by an action.
        await gladys
          .publishSceneEvent(
            event,
            eventData(event, summary, {
              house,
              device: idsOf(gladys, DEVICE_TYPES.AREA, house.selector).device,
              language: textLanguage(),
            }),
          )
          .catch((err) =>
            logger.warn(`Unable to publish the scene event ${event}: ${err.message}`),
          );
      }
      await offerDevices();
      await publishStates();
      refreshWidgets();
      await reportStatus(
        true,
        all('statusConnected', (lang) => ({
          stations: summary.stations,
          radius: formatNumber(config.radiusKm, lang),
          house: house.name,
        })),
      );
      return reading;
    } catch (err) {
      const { key, values } = problemOf(err);
      logger.warn(`Netatmo reading failed (${err.kind ?? 'error'}): ${err.message}`);
      await reportStatus(false, all(key, values));
      throw err;
    }
  }

  /**
   * @description One reading at a time; the next one is scheduled after it.
   * @returns {Promise<object|null>} The reading, null on failure.
   */
  function round() {
    if (!running) {
      running = readNow()
        .then((result) => {
          schedule(config.interval * MINUTE_MS);
          return result;
        })
        .catch((err) => {
          if (!WAITS_FOR_USER.includes(err.kind)) {
            schedule(RETRY_MS);
          }
          return null;
        })
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  function schedule(ms) {
    clearTimeout(roundTimer);
    if (!timer || stopped) {
      return;
    }
    roundTimer = setTimeout(round, ms);
    roundTimer.unref?.();
  }

  // --- Dashboard widgets --------------------------------------------------------

  /**
   * @description The message a widget shows instead of data, or null.
   * @param {string} lang - The language of the widget.
   * @returns {object|null} The content.
   */
  function widgetProblem(lang) {
    rememberLanguage(lang);
    if (!reading) {
      if (lastStatus) {
        const [connected, message] = JSON.parse(lastStatus);
        if (!connected) {
          return messageContent(message[lang] ?? message.en);
        }
      }
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.NEIGHBORHOOD, async ({ language: lang } = {}) => {
    return (
      widgetProblem(lang) ??
      buildNeighborhoodWidget({
        reading,
        house,
        radiusKm: config.radiusKm,
        language: lang,
        timeZone,
        now: now(),
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.STATIONS, async ({ language: lang } = {}) => {
    return widgetProblem(lang) ?? buildStationsWidget({ stations, language: lang, now: now() });
  });

  gladys.onWidgetGet(WIDGETS.HISTORY, async ({ settings = {}, language: lang } = {}) => {
    return (
      widgetProblem(lang) ??
      buildHistoryWidget({
        readings: store.data.readings,
        measure: settings.measure,
        language: lang,
        now: now(),
      })
    );
  });

  // --- Scene action -------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.READ_WEATHER, async (fields = {}) => {
    const radius = Number(fields.radius_km);
    const radiusKm = Number.isFinite(radius) && radius > 0 ? Math.min(20, radius) : config.radiusKm;
    const lang = textLanguage();
    const target = house ?? (await resolveHouse());
    // No trigger fires here: an action never starts an event.
    const found = await readStations(target, radiusKm);
    const summary = summarize(found, config.statistic);
    const number = (key) => (Number.isFinite(summary.values[key]) ? summary.values[key] : null);
    return {
      stations: summary.stations,
      temperature: number('temperature'),
      humidity: number('humidity'),
      pressure: number('pressure'),
      rain_1h: number('rain_1h'),
      rain_24h: number('rain_24h'),
      wind_speed: number('wind_speed'),
      wind_gust: number('wind_gust'),
      wind_direction: number('wind_direction'),
      raining: summary.raining === true,
      summary:
        summary.stations === 0
          ? t('actionNoStation', lang, { radius: formatNumber(radiusKm, lang), house: target.name })
          : t('actionSummary', lang, {
              house: target.name,
              stations: summary.stations,
              radius: formatNumber(radiusKm, lang),
              weather: weatherText(summary, lang),
            }),
    };
  });

  // --- Configuration button -----------------------------------------------------

  gladys.onAction(ACTIONS.CHECK, async () => {
    const result = await round();
    if (!result) {
      return JSON.parse(lastStatus ?? '[false,{}]')[1];
    }
    return all((lang) =>
      result.summary.stations === 0
        ? t('actionNoStation', lang, {
            radius: formatNumber(config.radiusKm, lang),
            house: house.name,
          })
        : t('actionSummary', lang, {
            house: house.name,
            stations: result.summary.stations,
            radius: formatNumber(config.radiusKm, lang),
            weather: weatherText(result.summary, lang),
          }),
    );
  });

  // --- OAuth2 -------------------------------------------------------------------

  gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error(t('statusNoClient', textLanguage()));
    }
    if (!redirectUri) {
      throw new Error('Gladys gave no redirect URI: update Gladys');
    }
    const state = randomBytes(24).toString('base64url');
    pendingAuth = { state, redirectUri };
    // Persisted: the container may restart between "Connect" and the return
    // from Netatmo (the memory alone would then refuse a valid answer).
    await gladys.setConfig({
      [INTERNAL_KEYS.oauthState]: state,
      [INTERNAL_KEYS.oauthRedirectUri]: redirectUri,
    });
    logger.info(`Netatmo authorization started (redirect URI ${redirectUri})`);
    return client.authorizeUrl({ clientId: config.clientId, redirectUri, state });
  });

  /**
   * @description The connection: check the state (single use), exchange the
   * code, keep the tokens, read.
   * @param {object} params - `{ code, state, redirectUri }`.
   * @returns {Promise<void>}
   */
  async function connect({ code, state, redirectUri }) {
    let expected = pendingAuth;
    if (!expected.state) {
      expected = normalizeConfig(await gladys.getConfig()).pendingAuth;
    }
    if (!expected.state || expected.state !== state) {
      lastStatus = null;
      await reportStatus(false, all('connectState'));
      throw new Error('OAuth state mismatch');
    }
    pendingAuth = { state: '', redirectUri: '' };
    await gladys
      .setConfig({ [INTERNAL_KEYS.oauthState]: '', [INTERNAL_KEYS.oauthRedirectUri]: '' })
      .catch((err) => logger.warn(`Unable to clear the OAuth state: ${err.message}`));
    let tokens;
    try {
      tokens = await client.exchangeCode(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          code,
          // Netatmo wants the redirect URI of the authorization request.
          redirectUri: expected.redirectUri || redirectUri,
        },
        now(),
      );
    } catch (err) {
      lastStatus = null;
      await reportStatus(false, all('connectFailed', { reason: err.code ?? err.kind }));
      throw err;
    }
    await saveTokens(tokens);
    logger.info('Connected to Netatmo');
    lastStatus = null;
    offered = null;
    // The connection succeeded even if this first reading fails: its status
    // says why (house without a position, Netatmo unavailable…).
    await round();
  }

  gladys.onOAuthCallback(async (key, { code, state, redirectUri } = {}) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (typeof code !== 'string' || !code) {
      lastStatus = null;
      await reportStatus(false, all('connectFailed', { reason: 'no code' }));
      throw new Error('Netatmo sent no authorization code');
    }
    // The same callback twice at once: the second one waits for the first.
    const hash = createHash('sha256').update(code).digest('hex');
    if (inflight.has(hash)) {
      return inflight.get(hash);
    }
    const run = connect({ code, state, redirectUri })
      .catch((err) => {
        // The SDK turns the exception into a refused connection without
        // logging it: say why here (never the code nor a token).
        logger.error(`Netatmo connection failed: ${err.message}`);
        throw err;
      })
      .finally(() => inflight.delete(hash));
    inflight.set(hash, run);
    return run;
  });

  // --- Devices ------------------------------------------------------------------

  gladys.onSetValue(async (device, feature) => {
    throw new Error(`Read-only feature: ${feature.external_id}`);
  });

  gladys.onScanRequest(async () => {
    await round();
    await offerDevices(true);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration ------------------------------------------------------------

  /**
   * @description Read the configuration; the tokens in memory win over older
   * stored ones (rotation).
   * @param {object} [fallback] - The config the event carried.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
    const stored = config.auth;
    if (!auth.refreshToken || stored.expiresAt > auth.expiresAt || stored.lost !== auth.lost) {
      auth = { ...stored };
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info(
      `Configuration: ${config.radiusKm} km, ${config.statistic}, ${config.maxStations} stations, ` +
        `every ${config.interval} min, application ${config.clientId ? 'set' : 'missing'}, ` +
        `account ${auth.refreshToken ? 'connected' : 'not connected'}`,
    );
    offered = null;
    lastStatus = null;
    await round();
  });

  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      stopped = false;
      await store.load();
      await loadConfig();
      await refreshCreatedDevices();
      lastStatus = null;
      offered = null;
      await round();
    })().catch((err) => logger.error('Post-connection initialization failed', err));
  });

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearTimeout(roundTimer);
    await store.save();
  });

  return {
    getConfig: () => config,
    auth: () => ({ ...auth }),
    reading: () => reading,
    stations: () => stations,
    round,
    store,
    whenReady: () => startup,
    stop: () => {
      stopped = true;
      clearTimeout(roundTimer);
    },
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  TRIGGERS,
  TTL_SECONDS,
  problemOf,
  weatherText,
  NetatmoError,
};
