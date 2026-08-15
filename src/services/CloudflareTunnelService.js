const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, exec } = require('child_process');
const SettingsService = require('./SettingsService');

const CF_API = 'https://api.cloudflare.com/client/v4';

function cloudflaredDir() {
  return path.join(os.homedir(), '.cloudflared');
}

const running = new Set();

function request(token, method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
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
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch (e) { reject(new Error('Invalid response from Cloudflare')); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function writeCredentials(accountId, tunnelId, secret) {
  const dir = cloudflaredDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'credentials.json'), JSON.stringify({
    AccountTag: accountId,
    TunnelSecret: secret,
    TunnelID: tunnelId
  }, null, 2));
}

function writeConfig(tunnelId, hostname, port) {
  const dir = cloudflaredDir();
  fs.mkdirSync(dir, { recursive: true });
  const yaml = [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${path.join(dir, 'credentials.json')}`,
    ``,
    `ingress:`,
    `  - hostname: ${hostname}`,
    `    service: http://localhost:${port}`,
    `  - service: http_status:404`,
    ``
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'config.yml'), yaml);
}

function launchTunnel(args) {
  exec('pkill -f cloudflared', () => {});
  for (const pid of running) {
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    running.delete(pid);
  }
  try {
    const child = spawn('cloudflared', args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    running.add(child.pid);
    return true;
  } catch (e) {
    return false;
  }
}

function launchNamedTunnel(tunnelId) {
  const config = path.join(cloudflaredDir(), 'config.yml');
  return launchTunnel(['tunnel', '--config', config, 'run', tunnelId]);
}

function launchTokenTunnel() {
  return launchTunnel(['tunnel', 'run', '--token-file', path.join(cloudflaredDir(), 'token')]);
}

function isRunning() {
  return running.size > 0;
}

class CloudflareTunnelService {
  static async setup(token) {
    if (!token) token = SettingsService.get('cloudflare_api_token', '');
    const domain = SettingsService.getDomain();
    const zoneId = SettingsService.get('cloudflare_zone_id', '');
    if (!token) return { success: false, skipped: true, error: 'No Cloudflare token. Log in first.' };
    if (!zoneId) return { success: false, skipped: true, error: 'No Zone ID matched. Set your domain and log in again.' };

    const port = process.env.PORT || 3000;
    const hostname = `panel.${domain}`;

    try {
      const accounts = await request(token, 'GET', `${CF_API}/accounts?per_page=50`);
      const account = accounts?.body?.result?.[0];
      if (!account) return { success: false, error: 'Could not find a Cloudflare account for this login.' };
      const accountId = account.id;

      let tunnelId = SettingsService.get('cloudflare_tunnel_id', '');
      let secret = SettingsService.get('cloudflare_tunnel_secret', '');

      if (!tunnelId) {
        const list = await request(token, 'GET', `${CF_API}/accounts/${accountId}/cfd_tunnel?name=netherpanel`);
        const existing = list?.body?.result?.[0];
        if (existing && existing.id) {
          tunnelId = existing.id;
          secret = existing.secret || SettingsService.get('cloudflare_tunnel_secret', '');
        }
      }

      if (!tunnelId) {
        const created = await request(token, 'POST', `${CF_API}/accounts/${accountId}/cfd_tunnel`, {
          name: 'netherpanel',
          config_src: 'cloudflared'
        });
        const r = created?.body?.result;
        if (!r || !r.id) {
          return { success: false, error: `Tunnel creation failed: ${created?.body?.errors?.[0]?.message || `HTTP ${created.status}`}` };
        }
        tunnelId = r.id;
        secret = r.secret || r.tunnel_secret || '';
      }

      if (!secret) {
        return { success: false, error: 'Tunnel exists but its secret could not be retrieved. Delete it in the Cloudflare dashboard (Zero Trust > Networks > Tunnels) and try again.' };
      }

      SettingsService.set('cloudflare_account_id', accountId, 'cloudflare');
      SettingsService.set('cloudflare_tunnel_id', tunnelId, 'cloudflare');
      SettingsService.set('cloudflare_tunnel_secret', secret, 'cloudflare');

      writeCredentials(accountId, tunnelId, secret);
      writeConfig(tunnelId, hostname, port);

      const target = `${tunnelId}.cfargotunnel.com`;
      const recUrl = `${CF_API}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`;
      const existingRec = await request(token, 'GET', recUrl);
      const rec = existingRec?.body?.result?.[0];
      if (rec && rec.content !== target) {
        await request(token, 'PUT', `${CF_API}/zones/${zoneId}/dns_records/${rec.id}`, {
          type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1
        });
      } else if (!rec) {
        const add = await request(token, 'POST', `${CF_API}/zones/${zoneId}/dns_records`, {
          type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1
        });
        if (!add?.body?.success) {
          return { success: false, error: `DNS record creation failed: ${add?.body?.errors?.[0]?.message || 'unknown error'}` };
        }
      }

      const launched = launchNamedTunnel(tunnelId);
      return { success: true, tunnelId, hostname, url: `https://${hostname}`, running: launched };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  static async start() {
    if (fs.existsSync(path.join(cloudflaredDir(), 'token'))) {
      return { success: true, running: launchTokenTunnel(), legacy: true };
    }
    const token = SettingsService.get('cloudflare_api_token', '');
    const tunnelId = SettingsService.get('cloudflare_tunnel_id', '');
    const secret = SettingsService.get('cloudflare_tunnel_secret', '');
    const accountId = SettingsService.get('cloudflare_account_id', '');
    if (!token || !tunnelId || !secret || !accountId) return { success: false, skipped: true };
    try {
      writeCredentials(accountId, tunnelId, secret);
      writeConfig(tunnelId, `panel.${SettingsService.getDomain()}`, process.env.PORT || 3000);
      const launched = launchNamedTunnel(tunnelId);
      return { success: true, tunnelId, running: launched };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  static isRunning() {
    return isRunning();
  }
}

module.exports = CloudflareTunnelService;
