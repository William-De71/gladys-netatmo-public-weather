// -----------------------------------------------------------------------------
// HTTP client of the Netatmo Connect API (https://dev.netatmo.com), with the
// user's own application (client id + secret) and the OAuth2 authorization
// code flow relayed by Gladys.
//
// Checked against the real API (2026-11-24):
//   - getpublicdata without a token: 400 {"error":{"code":1,"message":"Access token is missing"}};
//   - a wrong token: 403 {"error":{"code":2,"message":"Invalid access token"}};
//   - the token endpoint with a wrong client: 400 {"error":"invalid_client"}.
// Code 3 is an expired token (refresh, then once again); code 26 or HTTP 429
// is the user quota (500 requests an hour).
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.netatmo.com';
const SCOPE = 'read_station';
const ERROR_KINDS = {
  NO_CLIENT: 'no_client',
  NOT_CONNECTED: 'not_connected',
  TOKEN: 'token',
  AUTH_LOST: 'auth_lost',
  RATE_LIMIT: 'rate_limit',
  UNREACHABLE: 'unreachable',
  API: 'api',
};

class NetatmoError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - The message (never a token).
   * @param {object} [extra] - `{ status, code }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'NetatmoError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/**
 * @description The kind of a Netatmo error answer.
 * @param {number} status - HTTP status.
 * @param {object} body - The parsed body.
 * @returns {NetatmoError} The error.
 */
function errorOf(status, body) {
  const error = body?.error;
  const code = typeof error === 'object' ? Number(error?.code) : undefined;
  const text = typeof error === 'string' ? error : (error?.message ?? `HTTP ${status}`);
  if (status === 429 || code === 26) {
    return new NetatmoError(ERROR_KINDS.RATE_LIMIT, text, { status, code });
  }
  if (code === 2 || code === 3 || status === 401) {
    return new NetatmoError(ERROR_KINDS.TOKEN, text, { status, code });
  }
  if (['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(error)) {
    return new NetatmoError(ERROR_KINDS.AUTH_LOST, text, { status, code: error });
  }
  if (status >= 500) {
    return new NetatmoError(ERROR_KINDS.UNREACHABLE, text, { status, code });
  }
  return new NetatmoError(ERROR_KINDS.API, text, { status, code });
}

/**
 * @description The client.
 * @param {object} options - `{ baseUrl, fetchImpl, userAgent, timeoutMs }`.
 * @returns {object} `{ authorizeUrl, exchangeCode, refresh, publicData }`.
 */
function createNetatmoClient({
  baseUrl = BASE_URL,
  fetchImpl = globalThis.fetch,
  userAgent = 'gladys-netatmo-public-weather',
  timeoutMs = 30_000,
} = {}) {
  async function call(path, init) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', 'User-Agent': userAgent, ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new NetatmoError(ERROR_KINDS.UNREACHABLE, err.message);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      throw errorOf(response.status, body);
    }
    return body;
  }

  /**
   * @description The token answer read: Netatmo writes `expires_in` (and the
   * older `expire_in`), and rotates the refresh token.
   * @param {object} body - The answer.
   * @param {number} now - Now (ms).
   * @returns {{ accessToken: string, refreshToken: string, expiresAt: number }} The tokens.
   */
  function tokensOf(body, now) {
    if (typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string') {
      throw new NetatmoError(ERROR_KINDS.API, 'Netatmo sent no token');
    }
    const seconds = Number(body.expires_in ?? body.expire_in) || 10800;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: now + seconds * 1000,
    };
  }

  const form = (fields) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(fields).toString(),
  });

  return {
    authorizeUrl({ clientId, redirectUri, state }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPE,
        state,
      });
      return `${baseUrl}/oauth2/authorize?${params}`;
    },
    async exchangeCode({ clientId, clientSecret, code, redirectUri }, now = Date.now()) {
      const body = await call(
        '/oauth2/token',
        form({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          scope: SCOPE,
        }),
      );
      return tokensOf(body, now);
    },
    async refresh({ clientId, clientSecret, refreshToken }, now = Date.now()) {
      const body = await call(
        '/oauth2/token',
        form({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      );
      return tokensOf(body, now);
    },
    async publicData(box, accessToken) {
      const params = new URLSearchParams({
        lat_ne: String(box.lat_ne),
        lon_ne: String(box.lon_ne),
        lat_sw: String(box.lat_sw),
        lon_sw: String(box.lon_sw),
        filter: 'true',
      });
      return call(`/api/getpublicdata?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
  };
}

export { BASE_URL, SCOPE, ERROR_KINDS, NetatmoError, errorOf, createNetatmoClient };
