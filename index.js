// -----------------------------------------------------------------------------
// Entry point of the Netatmo Public Weather external integration.
//
// Brings the public Netatmo weather stations around a house into Gladys,
// through the user's own Netatmo Connect application (OAuth2):
//   - devices: the weather of the neighborhood, the nearest stations
//     (src/device.js);
//   - scene triggers: the rain starts, the rain stops;
//   - scene action: read the weather nearby now;
//   - dashboard widgets: weather nearby, nearby stations, last 24 hours.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Netatmo Public Weather integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
