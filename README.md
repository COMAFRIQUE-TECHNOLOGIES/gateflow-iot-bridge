# GateFlow IoT Bridge

Bridge MQTT vers GateFlow Laravel. Le mode par défaut cible ChirpStack local.

## Installation

```bash
git clone https://github.com/your-org/gateflow-iot-bridge.git
cd gateflow-iot-bridge
npm ci --production
cp .env.example .env
```

## Configuration

Éditer `.env` avec :

- `MQTT_PAYLOAD_FORMAT=chirpstack`
- `MQTT_BROKER_HOST=127.0.0.1`
- `MQTT_TOPIC_SUBSCRIBE=application/+/device/+/event/up`
- `MQTT_USERNAME`, `MQTT_PASSWORD` si Mosquitto impose une authentification.
- `LARAVEL_HOST`, `LARAVEL_ENDPOINT`, `IOT_WEBHOOK_SECRET` pour l'API Laravel.

Le mode TTN reste disponible avec `MQTT_PAYLOAD_FORMAT=ttn`, mais la production GateFlow doit utiliser ChirpStack tant que l'infrastructure locale est la source officielle.

## Déploiement Forge

Voir [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Démarrage local

```bash
npm run dev
```

Logs attendus:

```text
[MQTT] Connecte
[MQTT] Abonne a application/+/device/+/event/up
[IoT] Msg #1 de device_id
```
