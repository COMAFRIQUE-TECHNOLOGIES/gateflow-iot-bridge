const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { assessHealth } = require('../src/health');

function probe(url, secret) {
  return new Promise(resolve => {
    const req = (url.protocol === 'https:' ? https : http).get(url, { headers: { 'X-IoT-Secret': secret } }, res => {
      let body = '';
      res.on('data', data => { body += data; if (body.length > 16384) req.destroy(); });
      res.on('error', () => resolve(false));
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); }
        catch { resolve(false); }
      });
    });
    const timeout = setTimeout(() => req.destroy(), 5000);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', () => resolve(false));
  });
}

async function check(env = process.env) {
  const directory = env.BRIDGE_SPOOL_DIR || path.join(__dirname, '..', 'spool', env.MQTT_CLIENT_ID || '');
  let bridge = { ok: false, checks: { snapshot: false } };
  try { bridge = assessHealth(JSON.parse(fs.readFileSync(path.join(directory, '.health'), 'utf8'))); } catch {}
  let application = false;
  if (env.LARAVEL_HOST && env.IOT_WEBHOOK_SECRET) {
    try {
      const protocol = env.LARAVEL_PROTOCOL || 'https';
      const url = new URL(protocol + '://' + env.LARAVEL_HOST + ':' + (env.LARAVEL_PORT || (protocol === 'https' ? 443 : 80)) + '/api/iot/supervision');
      application = await probe(url, env.IOT_WEBHOOK_SECRET);
    } catch {}
  }
  return { ok: bridge.ok && application, bridge: bridge.checks, application };
}

if (require.main === module) {
  require('dotenv').config();
  check().then(result => { console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1; })
    .catch(() => { console.log(JSON.stringify({ ok: false })); process.exitCode = 1; });
}
module.exports = { check, probe };
