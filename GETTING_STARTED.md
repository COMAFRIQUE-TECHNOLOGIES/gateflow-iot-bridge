# Démarrage rapide

## Local (développement)

```bash
npm install
cp .env.example .env
# Éditer .env avec vos credentials TTN
npm run dev
```

Logs attendus:
```
[MQTT] Connecte
[MQTT] Abonne a v3/+/devices/+/up
[IoT] Msg #1 de device_id
```

## Production (Forge)

1. Clone dans `/home/forge/gateflow-iot-bridge`
2. Créer Daemon Forge : `cd /home/forge/gateflow-iot-bridge && pm2 start ecosystem.config.js --env production`
3. Vérifier : `pm2 status` et `pm2 logs gateflow-bridge`

Voir [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) pour détails complets.
