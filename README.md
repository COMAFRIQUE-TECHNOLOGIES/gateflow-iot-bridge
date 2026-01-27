# GateFlow IoT Bridge

MQTT Bridge - TTN vers Gateflow Laravel

## Installation

```bash
git clone https://github.com/your-org/gateflow-iot-bridge.git
cd gateflow-iot-bridge
npm ci --production
cp .env.example .env
```

## Configuration

Éditer `.env` avec:
- `MQTT_BROKER_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD` (TTN)
- `LARAVEL_HOST`, `LARAVEL_ENDPOINT`, `IOT_WEBHOOK_SECRET` (Laravel)

## Déploiement Forge

Voir [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

## Démarrage local

```bash
npm run dev
```

Logs attendus:
```
[MQTT] Connecte
[MQTT] Abonne a v3/+/devices/+/up
[IoT] Msg #1 de device_id
```
