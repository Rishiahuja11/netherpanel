const https = require('https');

const CF_API = 'https://api.cloudflare.com/client/v4';

class CloudflareService {
  constructor(apiToken, zoneId, serverIp) {
    this.apiToken = apiToken;
    this.zoneId = zoneId;
    this.serverIp = serverIp;
  }

  static fromSettings(db) {
    const token = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_api_token'")?.get()?.value;
    const zoneId = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_zone_id'")?.get()?.value;
    const ip = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_server_ip'")?.get()?.value;
    if (!token || !zoneId || !ip) return null;
    return new CloudflareService(token, zoneId, ip);
  }

  request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${CF_API}${path}`);
      const data = body ? JSON.stringify(body) : null;

      const opts = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

      const req = https.request(opts, (res) => {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(chunks);
            resolve(json);
          } catch (e) {
            reject(new Error('Invalid response from Cloudflare'));
          }
        });
      });

      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async createSubdomain(subdomain) {
    const fqdn = `${subdomain}.smp45.qzz.io`;

    const existing = await this.listDNSRecords('A', fqdn);
    if (existing.success && existing.result && existing.result.length > 0) {
      return { success: true, record: existing.result[0], fqdn, alreadyExists: true };
    }

    const result = await this.request('POST', `/zones/${this.zoneId}/dns_records`, {
      type: 'A',
      name: fqdn,
      content: this.serverIp,
      ttl: 1,
      proxied: false
    });

    return { success: result.success, record: result.result, fqdn };
  }

  async deleteSubdomain(subdomain) {
    const fqdn = `${subdomain}.smp45.qzz.io`;
    const records = await this.listDNSRecords('A', fqdn);
    if (!records.success || !records.result || records.result.length === 0) {
      return { success: true, message: 'Record not found' };
    }

    const recordId = records.result[0].id;
    const result = await this.request('DELETE', `/zones/${this.zoneId}/dns_records/${recordId}`);
    return { success: result.success };
  }

  async listDNSRecords(type, name) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (name) params.append('name', name);
    return this.request('GET', `/zones/${this.zoneId}/dns_records?${params}`);
  }

  async testConnection() {
    try {
      const result = await this.request('GET', `/zones/${this.zoneId}`);
      return { success: result.success, zoneName: result.result?.name };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = CloudflareService;
