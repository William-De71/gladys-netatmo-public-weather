// -----------------------------------------------------------------------------
// Dashboard widgets of the Netatmo Public Weather integration.
//
//   - `neighborhood`  the weather around the house: raining or not (status),
//                     up to six tiles (temperature, humidity, wind, gust,
//                     pressure, rain), how many stations and when;
//   - `stations`      the nearest public stations, one card each: distance,
//                     temperature, humidity, rain, wind;
//   - `history`       a measure of the neighborhood over the last 24 hours
//                     (temperature, humidity, pressure, wind, rain), its
//                     lowest and highest values.
// No refresh button: Netatmo is read on the integration's own timer. Every
// text exists in the four languages (the content is cached per language).
// Content budget of a card: 8 components, 1 main one, 6 tiles, 2 texts
// (1 body), 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, ago, compassPoint, formatNumber } from './i18n.js';
import { measureOf, round } from './measures.js';
import { isWet, placeOf } from './stations.js';
import { formatTime } from './time.js';

const WIDGETS = { NEIGHBORHOOD: 'neighborhood', STATIONS: 'stations', HISTORY: 'history' };
const HISTORY_MEASURES = {
  temperature: { series: ['temperature'], unit: '°C', chart: 'area' },
  humidity: { series: ['humidity'], unit: '%', chart: 'area' },
  pressure: { series: ['pressure'], unit: 'hPa', chart: 'line' },
  wind: { series: ['wind_speed', 'wind_gust'], unit: 'km/h', chart: 'line' },
  rain: { series: ['rain_1h'], unit: 'mm', chart: 'bar' },
};
const TTL_SECONDS = { content: 300, message: 120 };
const TILE_ORDER = [
  'temperature',
  'humidity',
  'wind_speed',
  'wind_gust',
  'pressure',
  'rain_24h',
  'rain_1h',
];
const TILE_ICONS = {
  temperature: 'thermometer',
  humidity: 'droplet',
  wind_speed: 'wind',
  wind_gust: 'wind',
  pressure: 'activity',
  rain_24h: 'cloud-rain',
  rain_1h: 'cloud-drizzle',
};
const MAX_TILES = 6;
const MAX_CARDS = 8;
const CHART_MS = 24 * 3600_000;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Seconds before Gladys asks again.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description "12,3 °C".
 * @param {string} key - The measure.
 * @param {number} value - The value.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const show = (key, value, language) =>
  `${formatNumber(round(key, value), language, measureOf(key).decimals)} ${measureOf(key).unit}`;

/**
 * @description The value of a tile: whole hectopascals (a tile is narrow).
 * @param {string} key - The measure.
 * @param {number} value - The value.
 * @returns {number} The value.
 */
const tileValue = (key, value) => (key === 'pressure' ? Math.round(value) : round(key, value));

/**
 * @description The "neighborhood" widget.
 * @param {object} options - `{ reading, house, radiusKm, language, timeZone, now }`:
 * `reading` is `{ at, summary }`.
 * @returns {object} The content.
 */
function buildNeighborhoodWidget({ reading, house, radiusKm, language, timeZone, now }) {
  const { summary } = reading;
  if (summary.stations === 0) {
    return messageContent(
      t('widgetNoStation', language, { radius: formatNumber(radiusKm, language) }),
    );
  }
  const { values } = summary;
  const components = [];
  if (summary.raining !== null) {
    components.push({
      type: 'status',
      items: [
        {
          label: clip(t(summary.raining ? 'statusRaining' : 'statusDry', language), 40),
          value: clip(t('wetGauges', language, { wet: summary.wet, gauges: summary.gauges }), 40),
          icon: summary.raining ? 'cloud-rain' : 'sun',
          color: summary.raining ? WIDGET_COLORS.INFO : WIDGET_COLORS.SUCCESS,
        },
      ],
    });
  }
  const tiled = TILE_ORDER.filter((key) => Number.isFinite(values[key]))
    .filter((key) => key !== 'rain_1h' || !Number.isFinite(values.rain_24h))
    .slice(0, MAX_TILES);
  for (const key of tiled) {
    const tile = {
      type: 'value',
      value: tileValue(key, values[key]),
      unit: measureOf(key).unit,
      label: clip(
        t(`tile_${key}`, language, {
          direction: compassPoint(values.wind_direction, language),
        }).trim(),
        13,
      ),
      icon: TILE_ICONS[key],
    };
    if (key === 'temperature') {
      tile.color = values.temperature <= 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.PRIMARY;
    } else if (key.startsWith('rain_') && summary.raining) {
      tile.color = WIDGET_COLORS.INFO;
    }
    components.push(tile);
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text: clip(
      t('neighborhoodCaption', language, {
        stations: summary.stations,
        radius: formatNumber(radiusKm, language),
        house: house.name,
        time: formatTime(reading.at, { language, timeZone, now }),
      }),
      120,
    ),
  });
  return { ttl_seconds: TTL_SECONDS.content, components };
}

/**
 * @description The "stations" widget.
 * @param {object} options - `{ stations, language, now }`.
 * @returns {object} The content.
 */
function buildStationsWidget({ stations, language, now }) {
  const shown = stations.filter((station) => Object.keys(station.values).length > 0);
  if (shown.length === 0) {
    return messageContent(t('widgetNoStationShort', language));
  }
  const items = shown.slice(0, MAX_CARDS).map((station) => {
    const { values } = station;
    const value = (key) => (Number.isFinite(values[key]) ? show(key, values[key], language) : null);
    const wind = value('wind_speed')
      ? `${value('wind_speed')} ${compassPoint(values.wind_direction, language)}`.trim()
      : null;
    const wet = isWet(station);
    const details = [
      value('pressure') && `${t('tile_pressure', language)} ${value('pressure')}`,
      value('rain_1h') && `${t('tile_rain_1h', language)} ${value('rain_1h')}`,
      value('rain_24h') && `${t('tile_rain_24h', language)} ${value('rain_24h')}`,
      wind && `${t('tile_wind', language)} ${wind}`,
      value('wind_gust') && `${t('tile_wind_gust', language)} ${value('wind_gust')}`,
      Number.isFinite(station.altitude) &&
        t('altitude', language, { m: formatNumber(station.altitude, language, 0) }),
      station.at && t('measuredAgo', language, { ago: ago(station.at, now, language) }),
    ].filter(Boolean);
    return {
      title: clip(placeOf(station), 60),
      subtitle: clip(
        [
          `${formatNumber(station.distanceKm, language)} km`,
          value('temperature'),
          value('humidity'),
        ]
          .filter(Boolean)
          .join(' · '),
        60,
      ),
      ...(wet === null
        ? {}
        : {
            badge: {
              text: clip(t(wet ? 'badgeRain' : 'badgeDry', language), 16),
              color: wet ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
            },
          }),
      description: clip(details.join('\n'), 2000),
    };
  });
  return {
    ttl_seconds: TTL_SECONDS.content,
    components: [
      { type: 'card-list', display: 'list', items },
      { type: 'text', variant: 'caption', text: clip(t('attribution', language), 80) },
    ],
  };
}

/**
 * @description The lowest and highest point of a series.
 * @param {Array<{ at: number, value: number }>} points - The points.
 * @returns {{ min: object, max: object }} The points.
 */
function extremes(points) {
  let [min] = points;
  let [max] = points;
  for (const point of points) {
    if (point.value < min.value) min = point;
    if (point.value >= max.value) max = point;
  }
  return { min, max };
}

/**
 * @description The "history" widget.
 * @param {object} options - `{ readings, measure, language, now }`.
 * @returns {object} The content.
 */
function buildHistoryWidget({ readings, measure, language, now }) {
  const kind = HISTORY_MEASURES[measure] ? measure : 'temperature';
  const shape = HISTORY_MEASURES[kind];
  const [main] = shape.series;
  const series = shape.series
    .map((key) => ({
      key,
      points: (readings ?? [])
        .filter((item) => item.at >= now - CHART_MS && Number.isFinite(item.values[key]))
        .map((item) => ({ at: item.at, value: item.values[key] })),
    }))
    .filter(({ points }) => points.length > 0);
  const mainPoints = series.find(({ key }) => key === main)?.points ?? [];
  if (mainPoints.length < 2) {
    return messageContent(t('widgetNotEnough', language));
  }
  const span = extremes(mainPoints);
  const tile = (key, value, label, color) => ({
    type: 'value',
    value: tileValue(key, value),
    unit: measureOf(key).unit,
    label: clip(label, 13),
    ...(color ? { color } : {}),
  });
  const tiles = [];
  const annotations = [];
  const mark = (point, key, color) =>
    annotations.push({
      t: new Date(point.at).toISOString(),
      value: round(main, point.value),
      label: clip(t(key, language, { value: show(main, point.value, language) }), 16),
      color,
    });
  if (kind === 'wind') {
    tiles.push(tile(main, span.max.value, t('tileMax', language)));
    const gusts = series.find(({ key }) => key === 'wind_gust')?.points ?? [];
    if (gusts.length) {
      tiles.push(tile('wind_gust', extremes(gusts).max.value, t('tileMaxGust', language)));
    }
    mark(span.max, 'annotationMax', WIDGET_COLORS.DANGER);
  } else if (kind === 'rain') {
    const last = readings[readings.length - 1]?.values.rain_24h;
    if (Number.isFinite(last)) {
      tiles.push(tile('rain_24h', last, t('tile_rain_24h', language), WIDGET_COLORS.INFO));
    }
    tiles.push(tile(main, span.max.value, t('tileMaxRain', language)));
    if (span.max.value > 0) {
      mark(span.max, 'annotationMax', WIDGET_COLORS.INFO);
    }
  } else {
    const cold = kind === 'temperature';
    tiles.push(
      tile(main, span.min.value, t('tileMin', language), cold ? WIDGET_COLORS.INFO : null),
    );
    tiles.push(
      tile(main, span.max.value, t('tileMax', language), cold ? WIDGET_COLORS.DANGER : null),
    );
    mark(span.min, 'annotationMin', WIDGET_COLORS.INFO);
    mark(span.max, 'annotationMax', WIDGET_COLORS.DANGER);
  }
  return {
    ttl_seconds: TTL_SECONDS.content,
    components: [
      ...tiles,
      {
        type: 'chart',
        chart_type: shape.chart,
        title: clip(t(`chart_${kind}`, language), 40),
        unit: shape.unit,
        series: series.map(({ key, points }) => ({
          name: clip(t(`series_${key}`, language), 24),
          points: points.map((point) => ({
            t: new Date(point.at).toISOString(),
            v: round(key, point.value),
          })),
        })),
        ...(annotations.length ? { annotations } : {}),
      },
      { type: 'text', variant: 'caption', text: clip(t('attributionShort', language), 80) },
    ],
  };
}

export {
  WIDGETS,
  HISTORY_MEASURES,
  TTL_SECONDS,
  TILE_ORDER,
  clip,
  messageContent,
  buildNeighborhoodWidget,
  buildStationsWidget,
  buildHistoryWidget,
};
