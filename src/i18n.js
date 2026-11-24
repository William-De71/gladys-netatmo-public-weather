// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, statuses, scene texts,
// results of the configuration button. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo); German says "du", Spanish "usted", like
// Gladys. Street and town names are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices and measures
  areaDeviceName: {
    en: 'Netatmo weather around {house}',
    fr: 'Météo Netatmo autour de {house}',
    de: 'Netatmo-Wetter um {house}',
    es: 'Tiempo Netatmo alrededor de {house}',
  },
  stationDeviceName: {
    en: 'Netatmo {place}',
    fr: 'Netatmo {place}',
    de: 'Netatmo {place}',
    es: 'Netatmo {place}',
  },
  measure_temperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  measure_humidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  measure_pressure: {
    en: 'Pressure (sea level)',
    fr: 'Pression (niveau de la mer)',
    de: 'Luftdruck (Meereshöhe)',
    es: 'Presión (nivel del mar)',
  },
  measure_rain_1h: {
    en: 'Rain over the last hour',
    fr: 'Pluie de la dernière heure',
    de: 'Regen der letzten Stunde',
    es: 'Lluvia de la última hora',
  },
  measure_rain_24h: {
    en: 'Rain over 24 hours',
    fr: 'Pluie sur 24 heures',
    de: 'Regen in 24 Stunden',
    es: 'Lluvia en 24 horas',
  },
  measure_wind_speed: {
    en: 'Wind speed',
    fr: 'Vitesse du vent',
    de: 'Windgeschwindigkeit',
    es: 'Velocidad del viento',
  },
  measure_wind_gust: { en: 'Wind gust', fr: 'Rafale', de: 'Windböe', es: 'Ráfaga' },
  measure_wind_direction: {
    en: 'Wind direction',
    fr: 'Direction du vent',
    de: 'Windrichtung',
    es: 'Dirección del viento',
  },
  featureRaining: { en: 'Raining', fr: 'Il pleut', de: 'Es regnet', es: 'Llueve' },
  featureStations: {
    en: 'Stations used',
    fr: 'Stations utilisées',
    de: 'Genutzte Stationen',
    es: 'Estaciones usadas',
  },
  featureDistance: {
    en: 'Distance from home',
    fr: 'Distance de la maison',
    de: 'Entfernung vom Zuhause',
    es: 'Distancia de casa',
  },

  // scene texts
  summaryRainStarted: {
    en: 'Rain around {house}: {wet} of {gauges} rain gauges, {rain} mm in the last hour.',
    fr: 'Pluie autour de {house} : {wet} pluviomètres sur {gauges}, {rain} mm sur la dernière heure.',
    de: 'Regen um {house}: {wet} von {gauges} Regenmessern, {rain} mm in der letzten Stunde.',
    es: 'Lluvia alrededor de {house}: {wet} de {gauges} pluviómetros, {rain} mm en la última hora.',
  },
  summaryRainStopped: {
    en: 'The rain stopped around {house} ({wet} of {gauges} rain gauges wet, {rain24} mm over 24 h).',
    fr: 'La pluie s’est arrêtée autour de {house} ({wet} pluviomètres mouillés sur {gauges}, {rain24} mm sur 24 h).',
    de: 'Der Regen um {house} hat aufgehört ({wet} von {gauges} Regenmessern nass, {rain24} mm in 24 Std.).',
    es: 'La lluvia paró alrededor de {house} ({wet} de {gauges} pluviómetros mojados, {rain24} mm en 24 h).',
  },
  actionSummary: {
    en: 'Around {house} ({stations} stations within {radius} km): {weather}.',
    fr: 'Autour de {house} ({stations} stations dans {radius} km) : {weather}.',
    de: 'Um {house} ({stations} Stationen im Umkreis von {radius} km): {weather}.',
    es: 'Alrededor de {house} ({stations} estaciones en {radius} km): {weather}.',
  },
  actionNoStation: {
    en: 'No public Netatmo station within {radius} km of {house}.',
    fr: 'Aucune station Netatmo publique dans un rayon de {radius} km autour de {house}.',
    de: 'Keine öffentliche Netatmo-Station im Umkreis von {radius} km um {house}.',
    es: 'Ninguna estación Netatmo pública en {radius} km alrededor de {house}.',
  },
  weatherRaining: { en: 'raining', fr: 'il pleut', de: 'es regnet', es: 'llueve' },
  weatherDry: { en: 'dry', fr: 'sec', de: 'trocken', es: 'seco' },

  // widgets
  widgetNoStation: {
    en: 'No public Netatmo station within {radius} km. Widen the radius in the configuration.',
    fr: 'Aucune station Netatmo publique dans un rayon de {radius} km. Élargissez le rayon dans la configuration.',
    de: 'Keine öffentliche Netatmo-Station im Umkreis von {radius} km. Vergrößere den Radius in der Konfiguration.',
    es: 'Ninguna estación Netatmo pública en {radius} km. Amplíe el radio en la configuración.',
  },
  widgetNoStationShort: {
    en: 'No public Netatmo station nearby.',
    fr: 'Aucune station Netatmo publique à proximité.',
    de: 'Keine öffentliche Netatmo-Station in der Nähe.',
    es: 'Ninguna estación Netatmo pública cerca.',
  },
  widgetNotEnough: {
    en: 'Not enough readings yet: the chart fills up over the next hours.',
    fr: 'Pas encore assez de relevés : le graphique se remplit dans les prochaines heures.',
    de: 'Noch nicht genug Messungen: Das Diagramm füllt sich in den nächsten Stunden.',
    es: 'Aún no hay suficientes lecturas: el gráfico se completa en las próximas horas.',
  },
  notReadYet: {
    en: 'Netatmo has not been read yet. It will be in a few moments.',
    fr: 'Netatmo n’a pas encore été lu. Ce sera fait dans quelques instants.',
    de: 'Netatmo wurde noch nicht gelesen. Das geschieht in wenigen Augenblicken.',
    es: 'Netatmo aún no se ha leído. Se hará en unos instantes.',
  },
  statusRaining: { en: 'It is raining', fr: 'Il pleut', de: 'Es regnet', es: 'Está lloviendo' },
  statusDry: { en: 'No rain', fr: 'Pas de pluie', de: 'Kein Regen', es: 'Sin lluvia' },
  wetGauges: {
    en: '{wet}/{gauges} rain gauges',
    fr: '{wet}/{gauges} pluviomètres',
    de: '{wet}/{gauges} Regenmesser',
    es: '{wet}/{gauges} pluviómetros',
  },
  tile_temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  tile_humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
  tile_wind_speed: {
    en: 'Wind {direction}',
    fr: 'Vent {direction}',
    de: 'Wind {direction}',
    es: 'Viento {direction}',
  },
  tile_wind: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento' },
  tile_wind_gust: { en: 'Gusts', fr: 'Rafales', de: 'Böen', es: 'Ráfagas' },
  tile_pressure: { en: 'Pressure', fr: 'Pression', de: 'Luftdruck', es: 'Presión' },
  tile_rain_24h: { en: 'Rain 24 h', fr: 'Pluie 24 h', de: 'Regen 24 h', es: 'Lluvia 24 h' },
  tile_rain_1h: { en: 'Rain 1 h', fr: 'Pluie 1 h', de: 'Regen 1 h', es: 'Lluvia 1 h' },
  tileMin: { en: 'Lowest', fr: 'Minimum', de: 'Tiefstwert', es: 'Mínimo' },
  tileMax: { en: 'Highest', fr: 'Maximum', de: 'Höchstwert', es: 'Máximo' },
  tileMaxGust: { en: 'Max gust', fr: 'Rafale max', de: 'Max. Böe', es: 'Ráfaga máx.' },
  tileMaxRain: { en: 'Max in 1 h', fr: 'Max en 1 h', de: 'Max. in 1 h', es: 'Máx. en 1 h' },
  annotationMin: { en: 'min {value}', fr: 'min {value}', de: 'min {value}', es: 'mín {value}' },
  annotationMax: { en: 'max {value}', fr: 'max {value}', de: 'max {value}', es: 'máx {value}' },
  chart_temperature: {
    en: 'Temperature, last 24 h',
    fr: 'Température, dernières 24 h',
    de: 'Temperatur, letzte 24 Std.',
    es: 'Temperatura, últimas 24 h',
  },
  chart_humidity: {
    en: 'Humidity, last 24 h',
    fr: 'Humidité, dernières 24 h',
    de: 'Feuchte, letzte 24 Std.',
    es: 'Humedad, últimas 24 h',
  },
  chart_pressure: {
    en: 'Pressure, last 24 h',
    fr: 'Pression, dernières 24 h',
    de: 'Luftdruck, letzte 24 Std.',
    es: 'Presión, últimas 24 h',
  },
  chart_wind: {
    en: 'Wind, last 24 h',
    fr: 'Vent, dernières 24 h',
    de: 'Wind, letzte 24 Std.',
    es: 'Viento, últimas 24 h',
  },
  chart_rain: {
    en: 'Rain per hour, last 24 h',
    fr: 'Pluie par heure, dernières 24 h',
    de: 'Regen pro Stunde, letzte 24 Std.',
    es: 'Lluvia por hora, últimas 24 h',
  },
  series_temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  series_humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
  series_pressure: { en: 'Pressure', fr: 'Pression', de: 'Luftdruck', es: 'Presión' },
  series_wind_speed: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento' },
  series_wind_gust: { en: 'Gusts', fr: 'Rafales', de: 'Böen', es: 'Ráfagas' },
  series_rain_1h: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  neighborhoodCaption: {
    en: '{stations} stations within {radius} km of {house} · {time} · Netatmo',
    fr: '{stations} stations à {radius} km de {house} · {time} · Netatmo',
    de: '{stations} Stationen bis {radius} km um {house} · {time} · Netatmo',
    es: '{stations} estaciones a {radius} km de {house} · {time} · Netatmo',
  },
  altitude: { en: 'Altitude {m} m', fr: 'Altitude {m} m', de: 'Höhe {m} m', es: 'Altitud {m} m' },
  measuredAgo: {
    en: 'Measured {ago}',
    fr: 'Mesuré {ago}',
    de: 'Gemessen {ago}',
    es: 'Medido {ago}',
  },
  badgeRain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  badgeDry: { en: 'Dry', fr: 'Sec', de: 'Trocken', es: 'Seco' },
  attribution: {
    en: 'Data: public Netatmo weather stations',
    fr: 'Données : stations météo Netatmo publiques',
    de: 'Daten: öffentliche Netatmo-Wetterstationen',
    es: 'Datos: estaciones meteorológicas Netatmo públicas',
  },
  attributionShort: {
    en: 'Neighborhood, public Netatmo stations',
    fr: 'Quartier, stations Netatmo publiques',
    de: 'Umgebung, öffentliche Netatmo-Stationen',
    es: 'Barrio, estaciones Netatmo públicas',
  },

  // times
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },
  compass: {
    en: 'N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSW,SW,WSW,W,WNW,NW,NNW',
    fr: 'N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSO,SO,OSO,O,ONO,NO,NNO',
    de: 'N,NNO,NO,ONO,O,OSO,SO,SSO,S,SSW,SW,WSW,W,WNW,NW,NNW',
    es: 'N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSO,SO,OSO,O,ONO,NO,NNO',
  },

  // statuses (Configuration screen, 200 characters at most)
  statusNoClient: {
    en: 'Enter the client ID and secret of your Netatmo Connect application, save, then click Connect.',
    fr: 'Saisissez l’identifiant et le secret de votre application Netatmo Connect, enregistrez, puis cliquez sur Connecter.',
    de: 'Gib Client-ID und Secret deiner Netatmo-Connect-Anwendung ein, speichere und klicke dann auf Verbinden.',
    es: 'Introduzca el ID y el secreto de su aplicación Netatmo Connect, guarde y haga clic en Conectar.',
  },
  statusNotConnected: {
    en: 'Click Connect to link your Netatmo account.',
    fr: 'Cliquez sur Connecter pour relier votre compte Netatmo.',
    de: 'Klicke auf Verbinden, um dein Netatmo-Konto zu verknüpfen.',
    es: 'Haga clic en Conectar para vincular su cuenta Netatmo.',
  },
  statusAuthLost: {
    en: 'Netatmo refused the connection (access revoked or application changed). Click Connect again.',
    fr: 'Netatmo a refusé la connexion (accès révoqué ou application modifiée). Cliquez à nouveau sur Connecter.',
    de: 'Netatmo hat die Verbindung abgelehnt (Zugriff widerrufen oder Anwendung geändert). Klicke erneut auf Verbinden.',
    es: 'Netatmo rechazó la conexión (acceso revocado o aplicación modificada). Haga clic de nuevo en Conectar.',
  },
  statusNoHouse: {
    en: 'No house of Gladys has a position: set one in Settings > Houses.',
    fr: 'Aucune maison de Gladys n’a de position : renseignez-la dans Paramètres > Maisons.',
    de: 'Kein Zuhause in Gladys hat eine Position: Lege sie unter Einstellungen > Häuser fest.',
    es: 'Ninguna casa de Gladys tiene posición: indíquela en Ajustes > Casas.',
  },
  statusHouseNotLocated: {
    en: 'The house "{house}" has no position: set it in Settings > Houses.',
    fr: 'La maison « {house} » n’a pas de position : renseignez-la dans Paramètres > Maisons.',
    de: 'Das Zuhause „{house}“ hat keine Position: Lege sie unter Einstellungen > Häuser fest.',
    es: 'La casa «{house}» no tiene posición: indíquela en Ajustes > Casas.',
  },
  statusRateLimited: {
    en: 'Netatmo limits the requests of this account for now: next try in 15 minutes.',
    fr: 'Netatmo limite les requêtes de ce compte pour le moment : nouvel essai dans 15 minutes.',
    de: 'Netatmo begrenzt die Anfragen dieses Kontos gerade: neuer Versuch in 15 Minuten.',
    es: 'Netatmo limita por ahora las solicitudes de esta cuenta: nuevo intento en 15 minutos.',
  },
  statusUnreachable: {
    en: 'Netatmo cannot be reached: next try in 15 minutes.',
    fr: 'Netatmo est injoignable : nouvel essai dans 15 minutes.',
    de: 'Netatmo ist nicht erreichbar: neuer Versuch in 15 Minuten.',
    es: 'No se puede acceder a Netatmo: nuevo intento en 15 minutos.',
  },
  statusApiError: {
    en: 'Netatmo answered with an error: {detail}',
    fr: 'Netatmo a répondu par une erreur : {detail}',
    de: 'Netatmo hat mit einem Fehler geantwortet: {detail}',
    es: 'Netatmo respondió con un error: {detail}',
  },
  statusConnected: {
    en: 'Connected: {stations} public stations within {radius} km of {house}.',
    fr: 'Connecté : {stations} stations publiques dans un rayon de {radius} km autour de {house}.',
    de: 'Verbunden: {stations} öffentliche Stationen im Umkreis von {radius} km um {house}.',
    es: 'Conectado: {stations} estaciones públicas en {radius} km alrededor de {house}.',
  },
  connectState: {
    en: 'The connection expired or came from elsewhere: click Connect again.',
    fr: 'La connexion a expiré ou ne vient pas d’ici : cliquez à nouveau sur Connecter.',
    de: 'Die Verbindung ist abgelaufen oder kam von woanders: Klicke erneut auf Verbinden.',
    es: 'La conexión caducó o no viene de aquí: haga clic de nuevo en Conectar.',
  },
  connectFailed: {
    en: 'Netatmo refused the connection ({reason}). Check the client ID and secret, then click Connect again.',
    fr: 'Netatmo a refusé la connexion ({reason}). Vérifiez l’identifiant et le secret, puis cliquez à nouveau sur Connecter.',
    de: 'Netatmo hat die Verbindung abgelehnt ({reason}). Prüfe Client-ID und Secret und klicke erneut auf Verbinden.',
    es: 'Netatmo rechazó la conexión ({reason}). Compruebe el ID y el secreto y haga clic de nuevo en Conectar.',
  },
};

/**
 * @description Whether a value is one of the four languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - The text key.
 * @param {string} language - The language (English fallback).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - The text key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description "12 min ago".
 * @param {number|null} at - The instant (ms).
 * @param {number} now - Now (ms).
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('hoursAgo', language, { n: hours });
  }
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

/**
 * @description The compass point of an angle: "NW".
 * @param {number} degrees - The angle.
 * @param {string} language - The language.
 * @returns {string} The point, '' without an angle.
 */
function compassPoint(degrees, language) {
  if (!Number.isFinite(degrees)) {
    return '';
  }
  const points = t('compass', language).split(',');
  return points[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * @description A number in the format of a language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} [decimals] - Decimals at most.
 * @returns {string} The text, '–' when not a number.
 */
function formatNumber(value, language, decimals = 1) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: decimals,
  }).format(value);
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago, compassPoint, formatNumber };
