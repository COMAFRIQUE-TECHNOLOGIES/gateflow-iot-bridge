const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Spool } = require('../src/spool');
const { deliver, drain } = require('../src/transport');
const { envelope, GatewayStats } = require('../src/envelope');
const { decodeUplink } = require('../codecs/lansitec-bluetooth');

function spool(t, max) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gateflow-spool-test-'));
  const instance = new Spool(directory, max);
  t.after(() => { if (fs.existsSync(instance.lock)) instance.close(); fs.rmSync(directory, { recursive: true }); });
  return instance;
}
test('reprise disque et identité stable après redémarrage', t => {
  const first = spool(t);
  const key = first.put('application/a/device/b/event/up', Buffer.from('{"fCnt":1}'));
  first.close();
  const second = new Spool(first.directory);
  assert.equal(second.pending()[0].key, key);
  assert.equal(second.pending()[0].receivedAt, first.pending()[0].receivedAt);
  second.close();
});
test('deux destinations avancent indépendamment après un échec', async t => {
  const a = spool(t); const b = spool(t);
  for (const instance of [a, b]) instance.put('up', Buffer.from('{}'));
  await drain(a, async () => { throw new Error('503'); });
  await drain(b, async () => {});
  assert.equal(a.stats().pending, 1); assert.equal(b.stats().pending, 0);
  assert.equal(a.pending().length, 0);
  a.items.values().next().value.nextAt = 0;
  await drain(a, async () => {});
  assert.equal(a.stats().pending, 0);
});
test('un message identique ne gonfle pas le journal en attente', t => {
  const instance = spool(t);
  instance.put('up', Buffer.from('{}')); instance.put('up', Buffer.from('{}'));
  assert.equal(instance.stats().pending, 1);
});
test('un journal plein refuse la réception sans effacer les messages', t => {
  const instance = spool(t, 1);
  assert.throws(() => instance.put('up', Buffer.from('{}')), /plein/);
  assert.equal(instance.stats().pending, 0);
});
test('une seconde instance ne peut pas ouvrir le même journal', t => {
  const instance = spool(t);
  assert.throws(() => new Spool(instance.directory), /utilisé/);
});
test('le traitement respecte la concurrence maximale', async t => {
  const instance = spool(t);
  for (let i=0; i<10; i++) instance.put('up', Buffer.from(JSON.stringify({ i })));
  let active=0, max=0;
  await drain(instance, async () => { active++; max=Math.max(max,active); await new Promise(r=>setTimeout(r,10)); active--; }, 3);
  assert.equal(max, 3); assert.equal(instance.stats().pending, 7);
});
test('un acquittement HTTP sans garantie durable conserve le message', async t => {
  const server = http.createServer((req,res) => { req.resume(); res.writeHead(202); res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await assert.rejects(deliver(new URL('http://127.0.0.1:'+server.address().port), 'test-only', {}), /durable absent/);
});
test('un serveur HTTP bloqué finit en timeout', async t => {
  const server = http.createServer(req => req.resume());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  await assert.rejects(deliver(new URL('http://127.0.0.1:'+server.address().port), 'test-only', {}, { timeout: 30 }), /Délai/);
});
test('décodage protobuf des statistiques sans modifier le broker', () => {
  const buffer = GatewayStats.encode(GatewayStats.create({ gatewayId: '00112233', time: { seconds: 1700000000 }, rxPacketsReceived: 7 })).finish();
  const result = envelope({ key: 'id.json', topic: 'eu868/gateway/00112233/event/stats', payload: Buffer.from(buffer).toString('base64'), receivedAt: '2026-09-10T12:00:00Z' });
  assert.equal(result.event_type, 'gateway_stats'); assert.equal(result.stats.rxPacketsReceived, 7);
  assert.equal(result.time, '2023-11-14T22:13:20.000Z');
});
test('le JSON illisible est conservé pour examen', () => {
  const result = envelope({ key: 'id.json', topic: 'up', payload: Buffer.from('{oops').toString('base64'), receivedAt: '2026-09-10T12:00:00Z' });
  assert.equal(result.event_type, 'decode_error'); assert.ok(result.raw_base64);
});
test('message de vie séparé des listes de balises', () => {
  const result = decodeUplink({ bytes: [0x21, 90, 70, 0xff, 0x9c, 1, 2, 0] });
  assert.equal(result.data.event_type, 'relay_heartbeat'); assert.equal(result.data.beacons, undefined);
  assert.equal(result.data.battery_raw, 90);
});
test('rapport de balises et erreurs de longueur explicites', () => {
  const result = decodeUplink({ bytes: [0x81, 0, 16, 0xcc, 0x3a, 0xc0] });
  assert.deepEqual(result.data.beacons[0], { major: 16, minor: 52282, rssi: -64 });
  assert.equal(decodeUplink({ bytes: [0x85, 1] }).data.event_type, 'decode_error');
  assert.equal(decodeUplink({ bytes: [0x21] }).data.event_type, 'decode_error');
});

