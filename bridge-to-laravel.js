require('dotenv').config();
const mqtt = require('mqtt');
const path = require('node:path');
const { Spool } = require('./src/spool');
const { envelope } = require('./src/envelope');
const { deliver, drain } = require('./src/transport');
const { writeHealth } = require('./src/health');

function start(env = process.env) {
  for (const key of ['MQTT_BROKER_HOST', 'LARAVEL_HOST', 'IOT_WEBHOOK_SECRET', 'MQTT_CLIENT_ID']) {
    if (!env[key]) throw new Error('Configuration obligatoire : ' + key);
  }
  const format = env.MQTT_PAYLOAD_FORMAT || 'chirpstack';
  const clientId = env.MQTT_CLIENT_ID;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)) throw new Error('Identifiant MQTT invalide');
  const spool = new Spool(env.BRIDGE_SPOOL_DIR || path.join(__dirname, 'spool', clientId), Number(env.BRIDGE_MAX_BYTES || 268435456));
  const protocol = env.LARAVEL_PROTOCOL || 'https';
  const target = new URL(protocol + '://' + env.LARAVEL_HOST + ':' + (env.LARAVEL_PORT || (protocol === 'https' ? 443 : 80)) + (env.LARAVEL_ENDPOINT || '/api/iot/webhook'));
  const topics = (env.MQTT_TOPIC_SUBSCRIBE || (format === 'chirpstack' ? 'application/+/device/+/event/+' : 'v3/+/devices/+/up')).split(',');
  if (format === 'chirpstack') topics.push(...(env.MQTT_GATEWAY_TOPICS || 'eu868/gateway/+/event/stats,gateway/+/event/stats').split(','));
  const client = mqtt.connect({
    host: env.MQTT_BROKER_HOST, port: Number(env.MQTT_BROKER_PORT || 1883),
    protocol: env.MQTT_PROTOCOL || 'mqtt', username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined, clientId, clean: false, reconnectPeriod: 2000,
  });
  let subscribed = false;
  client.on('connect', () => {
    subscribed = false;
    client.subscribe(topics, { qos: 1 }, (error, granted) => {
      subscribed = !error && Array.isArray(granted) && topics.every(topic => granted.some(item => item.topic === topic && item.qos < 128));
      if (!subscribed) console.error('Abonnement MQTT refusé');
    });
  });
  client.on('close', () => { subscribed = false; });
  client.on('error', () => console.error('Erreur de transport MQTT'));
  let stopping = false;
  let draining = false;
  function health() {
    try { writeHealth(spool.directory, { connected: client.connected, subscribed, stopping, max_bytes: spool.maxBytes, ...spool.stats() }); }
    catch { console.error('Écriture de la sonde de santé impossible'); }
  }
  health();
  const healthTimer = setInterval(health, 15000);
  client.handleMessage = (packet, callback) => {
    try { spool.put(packet.topic, packet.payload); callback(); }
    catch (error) {
      console.error(error.message);
      // Un message non durable reste non acquitté sur le broker pour QoS 1.
      client.stream.destroy(); callback(error);
    }
  };
  const timer = setInterval(async () => {
    if (draining || stopping) return;
    draining = true;
    try {
      const results = await drain(spool, item => {
        const url = new URL(target);
        url.searchParams.set('event', item.topic.match(/\/event\/([^/]+)$/)?.[1] || 'up');
        return deliver(url, env.IOT_WEBHOOK_SECRET, envelope(item, format), {
          timeout: Number(env.BRIDGE_HTTP_TIMEOUT_MS || 10000),
          requireDurableAck: env.BRIDGE_REQUIRE_DURABLE_ACK !== 'false',
        });
      }, Math.max(1, Math.min(16, Number(env.BRIDGE_CONCURRENCY || 4))));
      for (const result of results) if (!result.ok) console.error('Livraison différée : ' + result.error);
    } finally { draining = false; }
  }, 250);
  const stats = setInterval(() => console.log(JSON.stringify({ service: 'iot-bridge', clientId, connected: client.connected, ...spool.stats() })), 60000);
  async function stop() {
    if (stopping) return;
    stopping = true; clearInterval(timer); clearInterval(stats); clearInterval(healthTimer); health();
    await client.endAsync();
    while (draining) await new Promise(resolve => setTimeout(resolve, 100));
    spool.close();
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  return { client, spool, stop };
}
if (require.main === module) {
  try { start(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { start };
