// -----------------------------------------------------------------------------
// The answer of `getpublicdata` read into stations, and the stations around a
// house summed up into the weather of the neighborhood.
//
// `getpublicdata` takes a rectangle (north-east and south-west corners): the
// rectangle drawn around the circle of the radius, then the stations outside
// the circle are dropped. A station is a NAMain (`_id`, its MAC address, the
// stable id) with its outdoor modules. A measure older than an hour (a station
// offline, a module with a flat battery) is not used.
//
// The neighborhood is the median (or the mean) of each measure over the
// stations that give it: one broken or sunny station does not move a median.
// The wind direction is the vector mean of the stations where the wind blows.
// It rains when at least a third of the rain gauges (one at least) measured
// rain over the last minutes (`rain_live`) or the last hour.
// -----------------------------------------------------------------------------

import { MEASURES, valid, round } from './measures.js';

const HOUR_S = 3600;
const KM_PER_DEGREE = 111.32;
const STATISTICS = { MEDIAN: 'median', MEAN: 'mean' };
const WET_SHARE = 1 / 3;

/**
 * @description The rectangle around a circle, for `getpublicdata`.
 * @param {{ latitude: number, longitude: number }} center - The house.
 * @param {number} radiusKm - The radius.
 * @returns {{ lat_ne: number, lon_ne: number, lat_sw: number, lon_sw: number }} The corners.
 */
function boxAround({ latitude, longitude }, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE;
  const cos = Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  const dLon = radiusKm / (KM_PER_DEGREE * cos);
  const fixed = (value) => Math.round(value * 10000) / 10000;
  return {
    lat_ne: fixed(Math.min(90, latitude + dLat)),
    lon_ne: fixed(Math.min(180, longitude + dLon)),
    lat_sw: fixed(Math.max(-90, latitude - dLat)),
    lon_sw: fixed(Math.max(-180, longitude - dLon)),
  };
}

/**
 * @description The great-circle distance.
 * @param {number} lat1 - Latitude 1.
 * @param {number} lon1 - Longitude 1.
 * @param {number} lat2 - Latitude 2.
 * @param {number} lon2 - Longitude 2.
 * @returns {number} Kilometres.
 */
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (value) => (value * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @description The latest values of a `res` module: `{ "<time>": [values] }`
 * against `type: ["temperature", "humidity"]`.
 * @param {object} module - The module.
 * @returns {{ at: number, values: object }|null} The values.
 */
function readRes(module) {
  if (!module?.res || typeof module.res !== 'object' || !Array.isArray(module.type)) {
    return null;
  }
  const times = Object.keys(module.res)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const row = times.length ? module.res[String(times[0])] : null;
  if (!Array.isArray(row)) {
    return null;
  }
  const values = {};
  module.type.forEach((name, index) => {
    if (name === 'temperature' || name === 'humidity' || name === 'pressure') {
      values[name] = row[index];
    }
  });
  return { at: times[0], values };
}

/**
 * @description One station of the answer.
 * @param {object} raw - An item of `body`.
 * @param {object} house - `{ latitude, longitude }`.
 * @param {number} serverTime - `time_server` (s).
 * @returns {object|null} `{ id, latitude, longitude, altitude, city, street,
 * distanceKm, at, values, modules }`, null when unusable.
 */
function parseStation(raw, house, serverTime) {
  const id = typeof raw?._id === 'string' ? raw._id.toLowerCase() : '';
  const location = raw?.place?.location;
  if (!/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(id) || !Array.isArray(location)) {
    return null;
  }
  const [longitude, latitude] = location.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const values = {};
  const modules = new Set();
  let at = 0;
  const fresh = (time) => Number.isFinite(time) && serverTime - time <= HOUR_S;
  const take = (key, value, time) => {
    const checked = valid(key, value);
    if (checked !== null && fresh(time)) {
      values[key] = checked;
      at = Math.max(at, time);
    }
  };
  for (const module of Object.values(raw.measures ?? {})) {
    const res = readRes(module);
    if (res) {
      for (const [key, value] of Object.entries(res.values)) {
        take(key, value, res.at);
        modules.add(key === 'pressure' ? 'station' : 'outdoor');
      }
    }
    if ('rain_60min' in (module ?? {}) || 'rain_24h' in (module ?? {})) {
      modules.add('rain');
      const time = Number(module.rain_timeutc);
      take('rain_1h', module.rain_60min, time);
      take('rain_24h', module.rain_24h, time);
      take('rain_live', module.rain_live, time);
    }
    if ('wind_strength' in (module ?? {})) {
      modules.add('wind');
      const time = Number(module.wind_timeutc);
      take('wind_speed', module.wind_strength, time);
      take('wind_gust', module.gust_strength, time);
      take('wind_direction', module.wind_angle, time);
    }
  }
  const text = (value) => (typeof value === 'string' ? value.trim().slice(0, 80) : '');
  return {
    id,
    latitude,
    longitude,
    altitude: Number.isFinite(Number(raw.place.altitude)) ? Number(raw.place.altitude) : null,
    city: text(raw.place.city),
    street: text(raw.place.street),
    distanceKm:
      Math.round(distanceKm(house.latitude, house.longitude, latitude, longitude) * 10) / 10,
    at: at ? at * 1000 : null,
    values,
    modules: [...modules].sort(),
  };
}

/**
 * @description The stations of an answer within the circle, nearest first.
 * @param {object} answer - `{ body, time_server }`.
 * @param {object} house - `{ latitude, longitude }`.
 * @param {number} radiusKm - The radius.
 * @param {number} now - Now (ms), when the answer has no server time.
 * @returns {object[]} The stations.
 */
function parseStations(answer, house, radiusKm, now) {
  const serverTime = Number(answer?.time_server) || Math.floor(now / 1000);
  const seen = new Set();
  return (Array.isArray(answer?.body) ? answer.body : [])
    .map((raw) => parseStation(raw, house, serverTime))
    .filter((station) => {
      if (!station || station.distanceKm > radiusKm || seen.has(station.id)) {
        return false;
      }
      seen.add(station.id);
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

/**
 * @description The median or the mean of values.
 * @param {number[]} values - The values (at least one).
 * @param {string} statistic - One of STATISTICS.
 * @returns {number} The value.
 */
function middle(values, statistic) {
  if (statistic === STATISTICS.MEAN) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/**
 * @description The vector mean of the wind directions where the wind blows.
 * @param {object[]} stations - The stations.
 * @returns {number|null} Degrees, null without wind.
 */
function windDirection(stations) {
  let x = 0;
  let y = 0;
  for (const station of stations) {
    const { wind_direction: angle, wind_speed: speed } = station.values;
    if (Number.isFinite(angle) && speed > 0) {
      x += Math.sin((angle * Math.PI) / 180) * speed;
      y += Math.cos((angle * Math.PI) / 180) * speed;
    }
  }
  if (Math.hypot(x, y) < 1e-9) {
    return null;
  }
  return Math.round((((Math.atan2(x, y) * 180) / Math.PI + 360) % 360) % 360);
}

/**
 * @description Whether a station measured rain lately.
 * @param {object} station - The station.
 * @returns {boolean|null} Null without a rain gauge.
 */
function isWet(station) {
  const { rain_live: live, rain_1h: hour } = station.values;
  if (!Number.isFinite(live) && !Number.isFinite(hour)) {
    return null;
  }
  return live > 0 || hour > 0;
}

/**
 * @description The weather of the neighborhood.
 * @param {object[]} stations - The stations within the radius.
 * @param {string} statistic - One of STATISTICS.
 * @returns {object} `{ values, stations, counts, gauges, wet, raining }`.
 */
function summarize(stations, statistic) {
  const values = {};
  const counts = {};
  for (const { key } of MEASURES) {
    if (key === 'wind_direction') {
      continue;
    }
    const list = stations.map((station) => station.values[key]).filter(Number.isFinite);
    counts[key] = list.length;
    if (list.length) {
      values[key] = round(key, middle(list, statistic));
    }
  }
  const direction = windDirection(stations);
  if (direction !== null) {
    values.wind_direction = direction;
  }
  const gauges = stations.map(isWet).filter((wet) => wet !== null);
  const wet = gauges.filter(Boolean).length;
  return {
    values,
    counts,
    stations: stations.filter((station) => Object.keys(station.values).length > 0).length,
    gauges: gauges.length,
    wet,
    raining: gauges.length ? wet >= Math.max(1, Math.ceil(gauges.length * WET_SHARE)) : null,
  };
}

/**
 * @description A short name for a station: its street, its town, or the end
 * of its MAC address.
 * @param {object} station - The station.
 * @returns {string} "Rue des Lilas, Dijon".
 */
function placeOf(station) {
  return (
    [station.street, station.city].filter(Boolean).join(', ') ||
    `#${station.id.slice(-5).replace(':', '')}`
  );
}

export {
  STATISTICS,
  WET_SHARE,
  boxAround,
  distanceKm,
  parseStation,
  parseStations,
  middle,
  windDirection,
  isWet,
  summarize,
  placeOf,
};
