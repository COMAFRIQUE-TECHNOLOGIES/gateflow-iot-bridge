const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { assessHealth, writeHealth } = require('../src/health');
const { probe } = require('../ops/healthcheck');
const { Spool } = require('../src/spool');

const now = Date.now();
const healthy = { checked_at: new Date(now).toISOString(), connected: true, subscribed: true, stopping: false, oldest_age_seconds: 0, bytes: 0, max_bytes: 1000 };
test('détecte arrêt, retard, déconnexion et saturation sans exposer de secret', () => {
  assert.equal(assessHealth(healthy, now).ok, true);
  for (const delta of [{ checked_at: new Date(now - 61000).toISOString() }, { connected: false }, { subscribed: false }, { stopping: true }, { oldest_age_seconds: 181 }, { bytes: 800 }, { checked_at: 'invalid' }]) {
    assert.equal(assessHealth({ ...healthy, ...delta }, now).ok, false);
  }
});
test('la sonde ne devient pas un message du journal après redémarrage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateflow-health-'));
  try {
    writeHealth(dir, healthy);
    const spool = new Spool(dir);
    assert.equal(spool.stats().pending, 0);
    spool.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('une page HTML disponible ne suffit pas à valider la supervision', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: req.headers['x-iot-secret'] === 'fixture-only' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = new URL('http://127.0.0.1:' + server.address().port);
    assert.equal(await probe(url, 'fixture-only'), true);
    assert.equal(await probe(url, 'incorrect'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
