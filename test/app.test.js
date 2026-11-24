// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Netatmo API (test/helpers/fake-api.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { fakeNetatmo, dataDir, silent, NOW, TZ, DIJON, DRY, WET } from './helpers/fake-api.js';

const CONFIG = {
  client_id: 'client',
  client_secret: 'secret',
  radius_km: 3,
  language: 'fr',
  access_token: 'access-0',
  refresh_token: 'refresh-0',
  expires_at: NOW + 3 * 3600_000,
};
const HOUSES = [
  { selector: 'nowhere', name: 'Chalet', latitude: null, longitude: null },
  { selector: 'maison', name: 'Maison', ...DIJON },
];
const PREFIX = 'ext:test-integration';
const AREA = `${PREFIX}:area:maison`;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, api, dir, houses, clock }`.
 * @returns {Promise<object>} `{ gladys, app, api, dir }`.
 */
async function startApp({
  config = CONFIG,
  api = fakeNetatmo(),
  dir = dataDir(),
  houses = HOUSES,
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, houses });
  const app = createApp(gladys, {
    fetchImpl: api,
    now: () => clock.now,
    dataDir: dir,
    timeZone: TZ,
    timer: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, dir, clock };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const statesOf = (gladys, externalId) =>
  gladys.fake.states.filter((state) => state.device_feature_external_id.startsWith(externalId));

test('the first house with a position: the neighborhood and the nearest stations are offered', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [AREA, 'Météo Netatmo autour de Maison'],
      [`${PREFIX}:station:70ee50000001`, 'Netatmo Rue de la Liberté, Dijon'],
      [`${PREFIX}:station:70ee50000002`, 'Netatmo Dijon'],
      [`${PREFIX}:station:70ee50000003`, 'Netatmo Avenue Victor Hugo, Dijon'],
      [`${PREFIX}:station:70ee50000004`, 'Netatmo Dijon'],
    ],
  );
  const call = api.calls.find((item) => item.path === '/api/getpublicdata');
  assert.equal(call.headers.Authorization, 'Bearer access-0');
  assert.equal(call.params.filter, 'true');
  assert.ok(Number(call.params.lat_ne) > DIJON.latitude);
  assert.deepEqual(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /4 stations publiques dans un rayon de 3 km/,
  );
});

test('created devices get their states, nothing before', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.states.length, 0);
  await created(gladys, AREA);
  const states = Object.fromEntries(
    statesOf(gladys, AREA).map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
  );
  assert.equal(states.temperature, 8.4);
  assert.equal(states.raining, 0);
  assert.equal(states.stations, 4);
  await created(gladys, `${PREFIX}:station:70ee50000003`);
  assert.ok(statesOf(gladys, `${PREFIX}:station:70ee50000003`).some((s) => s.state === 21));
});

test('rain starts then stops: one event each, the summary in the language of the texts', async (t) => {
  const { gladys, app, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.setStations(WET);
  await app.round();
  const [started] = eventsOf(gladys, TRIGGERS.RAIN_STARTED);
  assert.ok(started, 'rain_started');
  assert.equal(started.data.wet_stations, 3);
  assert.equal(started.data.device, AREA);
  assert.match(started.data.summary, /^Pluie autour de Maison/);
  await app.round();
  assert.equal(eventsOf(gladys, TRIGGERS.RAIN_STARTED).length, 1);
  api.setStations(DRY);
  await app.round();
  assert.equal(eventsOf(gladys, TRIGGERS.RAIN_STOPPED).length, 0, 'one dry reading is a pause');
  await app.round();
  assert.equal(eventsOf(gladys, TRIGGERS.RAIN_STOPPED).length, 1);
});

test('a restart keeps the memory: no event fires twice', async () => {
  const dir = dataDir();
  const api = fakeNetatmo({ stations: WET });
  const first = await startApp({ dir, api });
  await first.gladys.fake.shutdown();
  const second = await startApp({ dir, api });
  assert.equal(eventsOf(second.gladys, TRIGGERS.RAIN_STARTED).length, 0);
  await second.gladys.fake.shutdown();
});

test('an access token about to expire is refreshed first, the rotated tokens stored', async (t) => {
  const clock = { now: NOW };
  const { gladys, app, api } = await startApp({ clock });
  t.after(() => gladys.fake.shutdown());
  clock.now = NOW + 3 * 3600_000 - 60_000;
  await app.round();
  const refresh = api.calls.filter((call) => call.path === '/oauth2/token');
  assert.equal(refresh.length, 1);
  assert.equal(refresh[0].form.refresh_token, 'refresh-0');
  assert.equal(app.auth().refreshToken, 'refresh-1');
  const config = await gladys.getConfig();
  assert.equal(config.refresh_token, 'refresh-1');
  assert.equal(config.access_token, 'access-1');
  assert.equal(api.calls.at(-1).headers.Authorization, 'Bearer access-1');
});

test('an expired token (code 3): refreshed once, the reading goes through', async (t) => {
  const { gladys, app, api } = await startApp({ api: fakeNetatmo({ expiredOnce: true }) });
  t.after(() => gladys.fake.shutdown());
  assert.ok(app.reading());
  assert.equal(api.calls.filter((call) => call.path === '/oauth2/token').length, 1);
});

test('a refused refresh token: the tokens are cleared, the status asks to connect again', async (t) => {
  const clock = { now: NOW + 4 * 3600_000 };
  const api = fakeNetatmo({ refreshError: 'invalid_grant' });
  const { gladys, app } = await startApp({ clock, api });
  t.after(() => gladys.fake.shutdown());
  assert.equal(app.auth().lost, true);
  assert.equal((await gladys.getConfig()).auth_lost, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /Cliquez à nouveau sur Connecter/);
  const calls = api.calls.length;
  await app.round();
  assert.equal(api.calls.length, calls, 'nothing is requested until Connect');
  const widget = await gladys.fake.widgetGet(WIDGETS.NEIGHBORHOOD, { language: 'en' });
  assert.match(JSON.stringify(widget.data), /Click Connect again/);
});

test('Connect: the authorization URL, then the code exchanged once, the tokens stored', async (t) => {
  const api = fakeNetatmo();
  const { gladys, app } = await startApp({
    api,
    config: { client_id: 'client', client_secret: 'secret' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.en, /Click Connect/);
  const ack = await gladys.fake.oauthAuthorizeUrl('netatmo_account', 'https://my.example/redirect');
  const url = new URL(ack.data.authorize_url);
  assert.equal(url.origin + url.pathname, 'https://api.netatmo.com/oauth2/authorize');
  assert.equal(url.searchParams.get('scope'), 'read_station');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://my.example/redirect');
  const state = url.searchParams.get('state');
  // A forged state is refused without reaching Netatmo.
  await gladys.fake.oauthCallback('netatmo_account', { code: 'c', state: 'forged' });
  assert.equal(api.calls.filter((call) => call.path === '/oauth2/token').length, 0);
  await gladys.fake.oauthCallback('netatmo_account', {
    code: 'the-code',
    state,
    redirectUri: 'https://my.example/redirect',
  });
  const exchange = api.calls.find((call) => call.path === '/oauth2/token');
  assert.deepEqual(
    [exchange.form.grant_type, exchange.form.code, exchange.form.redirect_uri],
    ['authorization_code', 'the-code', 'https://my.example/redirect'],
  );
  assert.equal(app.auth().refreshToken, 'refresh-1');
  assert.ok(app.reading(), 'read right after the connection');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('Connect without an application: a clear message', async (t) => {
  const { gladys } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.oauthAuthorizeUrl('netatmo_account', 'https://my.example/redirect');
  assert.equal(ack.success, false);
  assert.match(gladys.fake.connectionStatus.message.en, /client ID and secret/);
});

test('the scene action reads another radius, without firing any event', async (t) => {
  const { gladys, api } = await startApp({ api: fakeNetatmo({ stations: WET }) });
  t.after(() => gladys.fake.shutdown());
  const before = gladys.fake.sceneEvents.length;
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.READ_WEATHER, { radius_km: 5 });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.stations, 5);
  assert.equal(ack.data.outputs.raining, true);
  assert.match(ack.data.outputs.summary, /^Autour de Maison \(5 stations dans 5 km\)/);
  assert.equal(gladys.fake.sceneEvents.length, before);
  const box = api.calls.at(-1).params;
  assert.ok(Number(box.lat_ne) - DIJON.latitude > 0.044);
});

test('the configuration button reads now; widgets answer valid contents', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.CHECK);
  assert.match(ack.data.message.fr, /Autour de Maison \(4 stations dans 3 km\) : 8,4 °C/);
  for (const key of Object.values(WIDGETS)) {
    const widget = await gladys.fake.widgetGet(key, { language: 'de', settings: {} });
    assert.equal(widget.success, true, key);
    assert.deepEqual(validateWidgetContent(widget.data.content), [], key);
  }
});

test('no house with a position: the status says where to set it', async (t) => {
  const { gladys, api } = await startApp({ houses: [HOUSES[0]] });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Paramètres > Maisons/);
  assert.equal(api.calls.length, 0);
});
