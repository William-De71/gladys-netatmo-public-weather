# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the public Netatmo weather
stations: a Node.js service (Node 22+, ESM, no build step) that runs in its own
sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads `getpublicdata` of the Netatmo Connect
API (`https://api.netatmo.com`, https://dev.netatmo.com/apidocumentation/weather)
with the **user's own Netatmo Connect application** and the OAuth2 flow relayed
by Gladys (`oauth2` field), around a house of Gladys (`location: true`).
Transport: cloud only. **Never tested with a real Netatmo account**: the answer
shape follows the `getpublicdata.json` fixture of pyatmo; only the error
answers (no token 400 code 1, wrong token 403 code 2, wrong client 400
`invalid_client`) were checked against the real API (2026-11-24).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js              SDK wiring only (new GladysIntegration + createApp)
src/app.js            every handler, registered before connect(): OAuth2 (authorize URL,
                      callback), tokens (single-flight refresh), the reading timer,
                      the house, events, states, status, widgets, actions
src/netatmo-api.js    HTTP client: authorize URL, code exchange, refresh, getpublicdata;
                      error kinds (token, auth lost, rate limit, unreachable)
src/stations.js       the rectangle around the circle, the answer read into stations
                      (fresh measures only), the neighborhood (median or mean, vector
                      mean of the wind direction, raining when 1/3 of the gauges are wet)
src/measures.js       the measures, their bounds and Gladys feature shapes
src/events.js         rain_started / rain_stopped (baseline per area, 2 dry readings)
src/store.js          /data/netatmo-public-weather.json: area, raining, dry, 26 h readings
src/device.js         the neighborhood device and the station devices, their states
src/widgets.js        neighborhood, stations, history
src/time.js           times in the timezone of Gladys
src/config.js         configuration and internal keys (tokens, OAuth state, language)
src/i18n.js           runtime texts, en / fr / de / es
test/helpers/fake-api.js            the fake Netatmo API behind the `fetchImpl` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`area:<house selector>`, `station:<MAC without colons>`),
  feature `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema` and the values of its selects, `actions`, the widgets and
  their settings, scene triggers (variables) and the scene action (fields,
  outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Tokens.** Netatmo rotates the refresh token at every refresh: one refresh
  at a time (`refreshing`), the new tokens kept in memory first, then in
  internal config keys (`INTERNAL_KEYS`), never in `/data`, never in a log.
  The memory wins over an older stored copy. A refused refresh token
  (`invalid_grant`, `invalid_client`) clears them and sets `auth_lost`:
  nothing is requested until the user clicks Connect again.
- **Be gentle with Netatmo.** One request per reading (10 to 60 min, 15 min
  after a failure), one per scene action; Netatmo allows 500 an hour per user.
  Never a request per widget.
- **`should_poll` stays false**: the integration reads on its own timer.
- **The neighborhood device never changes shape** with the stations found: all
  its features always exist, a value Netatmo does not give is not published.
  A station device has the features of its modules at discovery.
- **Events once.** The first reading of an area (house, position, radius) is a
  baseline; the rain stops after two dry readings in a row. A scene action or
  a widget never fires an event.
- **Card lists**: the `date` of an item replaces its subtitle in the Gladys
  front: no `date`, the distance goes into the subtitle.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in English, French, German and Spanish;
  `test/i18n.test.js` checks it. German uses "du", Spanish "usted". Street and
  town names are never translated.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- Netatmo error answers: `{"error":{"code":N,"message":…}}` on the API (1 no
  token, 2 invalid token, 3 expired token, 26 user quota), `{"error":"…"}`
  on the token endpoint. Code 3 gets one refresh and one retry.
- Token answers carry `expires_in` (older ones `expire_in`), 10 800 s.
- `place.location` is `[longitude, latitude]`.
- `res` holds `{ "<unix time>": [values] }` in the order of `type`; take the
  latest time. Rain and wind modules carry flat fields with `rain_timeutc` /
  `wind_timeutc`.
- The redirect URI does not need to be declared in the Netatmo application
  (same as Terdious/gladys-netatmo); if Netatmo refuses it, the user pastes
  the one Gladys shows.
- `node --test` also runs `test/helpers/`: nothing starts on import.
