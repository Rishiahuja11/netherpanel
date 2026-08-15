const https = require('https');
const crypto = require('crypto');
const SettingsService = require('./SettingsService');
const CloudflareTunnelService = require('./CloudflareTunnelService');

const DASH_API = 'https://dash.cloudflare.com/api/v4';
const CF_API = 'https://api.cloudflare.com/client/v4';
const PENDING_TTL_MS = 5 * 60 * 1000;

const pending2FA = new Map();

function requestJson(url, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(chunks); } catch (e) { return reject(new Error('Invalid response from Cloudflare')); }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

class CloudflareAuthService {
  static async login(email, password) {
    const { status, body } = await requestJson(`${DASH_API}/login`, {
      method: 'POST',
      body: { email, password }
    });

    const token = body?.result?.token;
    if (status === 200 && token) {
      return CloudflareAuthService.completeLogin(token, email);
    }

    const twoFactor = status === 409 || body?.code === 1015 ||
      /two.?factor/i.test(body?.error || '') ||
      (body?.result && body.result.two_factor) ||
      (body?.errors && JSON.stringify(body.errors).toLowerCase().includes('two'));

    if (twoFactor) {
      if (!token) {
        throw new Error('Cloudflare requires 2FA but did not return an auth token (a security key or recovery code may be needed).');
      }
      const id = crypto.randomBytes(12).toString('hex');
      pending2FA.set(id, { token, email, expiresAt: Date.now() + PENDING_TTL_MS });
      return { requires2fa: true, pendingAuthId: id, email };
    }

    throw new Error(`Cloudflare login failed: ${body?.error || `HTTP ${status}`}`);
  }

  static async verify2fa(pendingAuthId, code) {
    const pending = pending2FA.get(pendingAuthId);
    if (!pending) throw new Error('Login session expired. Please start again.');
    if (pending.expiresAt < Date.now()) {
      pending2FA.delete(pendingAuthId);
      throw new Error('Login session expired. Please start again.');
    }
    if (!code) throw new Error('2FA code is required');

    const { status, body } = await requestJson(`${DASH_API}/two-factor`, {
      method: 'POST',
      token: pending.token,
      body: { code }
    });

    const token = body?.result?.token;
    if (status === 200 && token) {
      pending2FA.delete(pendingAuthId);
      return CloudflareAuthService.completeLogin(token, pending.email);
    }

    if (status === 400 || status === 403) {
      throw new Error('Invalid 2FA code. Try again (codes rotate every 30 seconds).');
    }
    throw new Error(`2FA verification failed: ${body?.error || `HTTP ${status}`}`);
  }

  static async completeLogin(token, email) {
    SettingsService.set('cloudflare_api_token', token, 'cloudflare');
    SettingsService.set('cloudflare_email', email || '', 'cloudflare');

    let zones = [];
    try {
      const { body } = await requestJson(`${CF_API}/zones?per_page=50`, { token });
      zones = (body?.result || []).map(z => ({ id: z.id, name: z.name }));
    } catch (e) {
      // Zone lookup is best-effort; token is still saved.
    }

    const domain = SettingsService.getDomain();
    const matched = zones.find(z => z.name === domain || domain.endsWith(`.${z.name}`));

    if (matched) {
      SettingsService.set('cloudflare_zone_id', matched.id, 'cloudflare');
    }

    const tunnel = await CloudflareTunnelService.setup(token);
    if (tunnel.success) SettingsService.set('cloudflare_tunnel_url', tunnel.url, 'cloudflare');

    return { success: true, email, zones, zoneId: matched ? matched.id : null, tunnel };
  }

  static clearPending(id) {
    pending2FA.delete(id);
  }
}

module.exports = CloudflareAuthService;
