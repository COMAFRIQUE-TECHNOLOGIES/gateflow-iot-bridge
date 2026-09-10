const protobuf = require('protobufjs');
const { decodeUplink } = require('../codecs/lansitec-bluetooth');

// Sous-ensemble filaire de gw.proto ChirpStack v4.18.0. Le brut conserve les autres champs.
const GatewayStats = protobuf.parse(`syntax = "proto3";
message Timestamp { int64 seconds = 1; int32 nanos = 2; }
message GatewayStats {
 bytes gateway_id_legacy = 1; string gateway_id = 17; Timestamp time = 2;
 string config_version = 4; uint32 rx_packets_received = 5; uint32 rx_packets_received_ok = 6;
 uint32 tx_packets_received = 7; uint32 tx_packets_emitted = 8; map<string,string> metadata = 10;
}`).root.lookupType('GatewayStats');

function envelope(item, format = 'chirpstack') {
  const raw = Buffer.from(item.payload, 'base64');
  const eventId = item.key.replace('.json', '');
  const metadata = { schema_version: 1, event_id: eventId, mqtt_topic: item.topic, received_at: item.receivedAt };
  if (/(^|\/)gateway\/[^/]+\/event\/stats$/.test(item.topic)) {
    try {
      const decoded = raw.toString().trimStart().startsWith('{')
        ? JSON.parse(raw.toString())
        : GatewayStats.toObject(GatewayStats.decode(raw), { longs: Number, bytes: String });
      const gatewayId = decoded.gatewayId || Buffer.from(decoded.gatewayIdLegacy || '', 'base64').toString('hex');
      const time = typeof decoded.time === 'string' ? decoded.time
        : decoded.time ? new Date(decoded.time.seconds * 1000 + (decoded.time.nanos || 0) / 1e6).toISOString() : null;
      if (!gatewayId) throw new Error('Identifiant passerelle absent');
      return { event_type: 'gateway_stats', gatewayId, time, stats: decoded, raw_base64: item.payload, bridge_metadata: metadata };
    } catch {
      return { event_type: 'decode_error', error: 'Statistiques passerelle illisibles', raw_base64: item.payload, bridge_metadata: metadata };
    }
  }
  try {
    const message = JSON.parse(raw.toString());
    if (!message || Array.isArray(message) || typeof message !== 'object') throw new Error('Objet attendu');
    if (format === 'ttn') return { raw_message: message, bridge_metadata: metadata };
    // Compléter uniquement les trames de vie reconnues, sans redécoder les balises existantes.
    if (typeof message.data === 'string') {
      const bytes = Array.from(Buffer.from(message.data, 'base64'));
      if (bytes[0] >> 4 === 2 && bytes.length === 8) {
        message.original_decoded = message.object || null;
        message.object = decodeUplink({ bytes }).data;
      }
    }
    return { ...message, bridge_metadata: { ...metadata, event_id: message.deduplicationId || eventId } };
  } catch {
    return { event_type: 'decode_error', error: 'Message MQTT JSON illisible', raw_base64: item.payload, bridge_metadata: metadata };
  }
}

module.exports = { envelope, GatewayStats };
