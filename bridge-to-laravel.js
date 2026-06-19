/**
 * MQTT Bridge - ChirpStack / TTN vers Gateflow Laravel.
 *
 * En mode ChirpStack, le payload MQTT est transmis tel quel au webhook Laravel
 * avec le parametre event extrait du topic.
 */

require('dotenv').config();
const mqtt = require('mqtt');
const http = require('http');
const https = require('https');

// ==============================
// Configuration
// ==============================

// Validation des variables d'environnement
if (!process.env.MQTT_BROKER_HOST || !process.env.LARAVEL_HOST) {
    console.error('ERREUR: Variables d\'environnement manquantes.');
    console.error('Veuillez configurer MQTT_BROKER_HOST, LARAVEL_HOST et IOT_WEBHOOK_SECRET');
    process.exit(1);
}

const payloadFormat = (process.env.MQTT_PAYLOAD_FORMAT || 'chirpstack').toLowerCase();
const isChirpStackMode = payloadFormat === 'chirpstack';

const mqttConfig = {
  host: process.env.MQTT_BROKER_HOST || '127.0.0.1',
  port: process.env.MQTT_BROKER_PORT || 1883,
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  protocol: 'mqtt',
  clientId: `gateflow-bridge-${payloadFormat}-${Math.random().toString(16).substr(2, 8)}`,
};

// ChirpStack v4: application/{application_id}/device/{dev_eui}/event/{event}
// TTN historique: v3/{app-id}/devices/{device-id}/up
const topic = process.env.MQTT_TOPIC_SUBSCRIBE || (
  isChirpStackMode ? 'application/+/device/+/event/up' : 'v3/+/devices/+/up'
);

// Configuration Laravel API
const laravelConfig = {
  host: process.env.LARAVEL_HOST || 'localhost',
  port: process.env.LARAVEL_PORT || 443,
  endpoint: process.env.LARAVEL_ENDPOINT || '/api/iot/webhook',
  protocol: process.env.LARAVEL_PROTOCOL || 'https',
  secret: process.env.IOT_WEBHOOK_SECRET
};

// ==============================
// Variables globales
// ==============================
let messageCount = 0;
let lastMessageTime = null;

// ==============================
// Fonctions utilitaires
// ==============================

/**
 * Envoie un message a l'API Laravel
 */
function extractChirpStackEvent(topicName) {
  const match = topicName.match(/\/event\/([^/]+)$/);

  return match ? match[1] : 'up';
}

function laravelPathFor(topicName) {
  if (!isChirpStackMode) {
    return laravelConfig.endpoint;
  }

  const event = encodeURIComponent(extractChirpStackEvent(topicName));
  const separator = laravelConfig.endpoint.includes('?') ? '&' : '?';

  return `${laravelConfig.endpoint}${separator}event=${event}`;
}

function deviceIdForLog(message) {
  return message.deviceInfo?.devEui
    || message.deviceInfo?.deviceName
    || message.end_device_ids?.dev_eui
    || 'unknown';
}

function toLaravelPayload(receivedTopic, message) {
  if (isChirpStackMode) {
    return {
      ...message,
      bridge_metadata: {
        bridge_type: 'node-mqtt-bridge-chirpstack',
        mqtt_topic: receivedTopic,
        received_at: new Date().toISOString(),
      },
    };
  }

  return {
    topic: receivedTopic,
    raw_message: message,
    bridge_metadata: {
      bridge_type: 'node-mqtt-bridge-ttn',
      received_at: new Date().toISOString(),
    },
  };
}

function sendToLaravel(payload, receivedTopic) {
  const data = JSON.stringify(payload);

  const options = {
    hostname: laravelConfig.host,
    port: laravelConfig.port,
    path: laravelPathFor(receivedTopic),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'X-IoT-Bridge': 'node-mqtt',
      'X-IoT-Secret': laravelConfig.secret
    },
    rejectUnauthorized: process.env.LARAVEL_REJECT_UNAUTHORIZED !== 'false',
  };

  const protocol = laravelConfig.protocol === 'https' ? https : http;

  const req = protocol.request(options, (res) => {
    // On ne loggue que les erreurs ou 1 statut sur 10 pour eviter le spam logs
    if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(`[Laravel] ERREUR ${res.statusCode} sur ${options.path}`);
    } else if (messageCount % 10 === 0) {
        // console.log(`[Laravel] OK (202 Accepted)`);
    }
  });

  req.on('error', (error) => {
    console.error(`[Laravel] Erreur de connexion: ${error.message}`);
  });

  req.write(data);
  req.end();
}

/**
 * Affiche les statistiques
 */
function showStats() {
  console.log(`[Stats] Messages: ${messageCount} | Dernier: ${lastMessageTime || 'Aucun'} | Mem: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
}

// ==============================
// Connexion MQTT
// ==============================

console.log('--- GATEFLOW BRIDGE DEMARRE ---');
console.log(`Mode: ${payloadFormat}`);
console.log(`MQTT: ${mqttConfig.host}:${mqttConfig.port}`);
console.log(`Topic: ${topic}`);
console.log(`API: ${laravelConfig.protocol}://${laravelConfig.host}`);

const client = mqtt.connect(mqttConfig);

client.on('connect', () => {
  console.log('[MQTT] Connecte');
  client.subscribe(topic, (err) => {
    if (err) console.error('[MQTT] Erreur Sub:', err);
    else console.log(`[MQTT] Abonne a ${topic}`);
  });
});

client.on('message', (receivedTopic, payload) => {
  messageCount++;
  lastMessageTime = new Date().toLocaleString('fr-FR');

  try {
    const message = JSON.parse(payload.toString());

    const devEui = deviceIdForLog(message);
    console.log(`[IoT] Msg #${messageCount} de ${devEui}`);

    const laravelPayload = toLaravelPayload(receivedTopic, message);

    sendToLaravel(laravelPayload, receivedTopic);

  } catch (error) {
    console.error('[ERROR] Parsing JSON MQTT:', error.message);
  }
});

client.on('error', (err) => console.error('[MQTT] Erreur:', err.message));

// Afficher les stats toutes les minutes
setInterval(showStats, 60000);
