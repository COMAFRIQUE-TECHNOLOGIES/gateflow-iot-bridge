/**
 * MQTT Bridge - TTN vers Gateflow Laravel
 *
 * Ce script fait le pont entre The Things Network et l'application Laravel.
 * VERSION PRODUCTION READY
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
    console.error('Veuillez configurer MQTT_BROKER_HOST, MQTT_USERNAME, MQTT_PASSWORD, LARAVEL_HOST, IOT_WEBHOOK_SECRET');
    process.exit(1);
}

const mqttConfig = {
  host: process.env.MQTT_BROKER_HOST || 'eu1.cloud.thethings.network',
  port: process.env.MQTT_BROKER_PORT || 1883,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  protocol: 'mqtt',
  clientId: `gateflow-bridge-${Math.random().toString(16).substr(2, 8)}`,
};

// Topic TTN a ecouter
const topic = process.env.MQTT_TOPIC_SUBSCRIBE || 'v3/+/devices/+/up';

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
function sendToLaravel(payload) {
  const data = JSON.stringify(payload);

  const options = {
    hostname: laravelConfig.host,
    port: laravelConfig.port,
    path: laravelConfig.endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'X-IoT-Bridge': 'node-mqtt',
      // SECUTITY: Envoi du token secret
      'X-IoT-Secret': laravelConfig.secret
    },
    rejectUnauthorized: false, // Utile si certificats auto-signes, a mettre a true en prod stricte
  };

  const protocol = laravelConfig.protocol === 'https' ? https : http;

  const req = protocol.request(options, (res) => {
    // On ne loggue que les erreurs ou 1 statut sur 10 pour eviter le spam logs
    if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(`[Laravel] ERREUR ${res.statusCode}`);
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
console.log(`MQTT: ${mqttConfig.host}`);
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

    // Log leger
    const devEui = message.end_device_ids?.dev_eui || 'unknown';
    console.log(`[IoT] Msg #${messageCount} de ${devEui}`);

    const laravelPayload = {
      topic: receivedTopic,
      raw_message: message,
      bridge_metadata: {
        bridge_type: 'node-mqtt-bridge-prod',
        received_at: new Date().toISOString(),
      },
    };

    sendToLaravel(laravelPayload);

  } catch (error) {
    console.error('[ERROR] Parsing JSON MQTT:', error.message);
  }
});

client.on('error', (err) => console.error('[MQTT] Erreur:', err.message));

// Afficher les stats toutes les minutes
setInterval(showStats, 60000);
