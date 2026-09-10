const http = require('node:http');
const https = require('node:https');

function deliver(url, secret, payload, { timeout = 10000, requireDurableAck = true } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'X-IoT-Secret': secret, 'X-IoT-Bridge': 'durable-v1',
      },
    }, response => {
      response.resume();
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
        if (requireDurableAck && response.headers['x-iot-durable'] !== '1') return reject(new Error('Acquittement durable absent'));
        resolve();
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Délai HTTP dépassé')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end(body);
  });
}

async function drain(spool, send, concurrency = 4) {
  const batch = spool.pending(Date.now(), concurrency);
  for (const item of batch) item.inFlight = true;
  return Promise.all(batch.map(async item => {
    try { await send(item); spool.acknowledge(item.key); return { ok: true }; }
    catch (error) { spool.failed(item); return { ok: false, error: error.message }; }
  }));
}

module.exports = { deliver, drain };
