# Déploiement sur Forge

## Préparation

SSH sur le serveur et cloner:

```bash
cd /home/forge
git clone https://github.com/your-org/gateflow-iot-bridge.git gateflow-iot-bridge
cd gateflow-iot-bridge
npm ci --production
cp .env.example .env
nano .env
```

Configurer `.env`:
- `MQTT_BROKER_HOST=eu1.cloud.thethings.network`
- `MQTT_USERNAME`, `MQTT_PASSWORD` (clés TTN)
- `LARAVEL_HOST=gateflow.on-forge.com`
- `IOT_WEBHOOK_SECRET=` (même valeur que dans `.env` Laravel)

## Créer le Daemon Forge

1. **Servers** > Sélectionner le serveur > **Daemons**
2. **Create Daemon** :
   - Command: `cd /home/forge/gateflow-iot-bridge && pm2 start ecosystem.config.js --env production`
   - User: `forge`
   - Directory: `/home/forge/gateflow-iot-bridge`

Vérifier:
```bash
pm2 status
pm2 logs gateflow-bridge
```

## Redéploiement automatique

Ajouter au **Deploy Script** du site Laravel (après npm build):

```bash
if [ -d "/home/forge/gateflow-iot-bridge" ]; then
  cd /home/forge/gateflow-iot-bridge
  git pull origin main
  npm ci --production
  pm2 reload ecosystem.config.js --env production
fi
```

## Vérification

```bash
# Logs
pm2 logs gateflow-bridge --lines 50

# Vérifier MQTT connecté
pm2 logs gateflow-bridge | grep "MQTT"

# Vérifier messages reçus
pm2 logs gateflow-bridge | grep "IoT"
```

## Dépannage

**Pas de connexion MQTT:**
```bash
cat /home/forge/gateflow-iot-bridge/.env | grep MQTT_
nc -zv eu1.cloud.thethings.network 1883
```

**Erreurs Laravel:**
```bash
# Vérifier que le secret est identique
grep IOT_WEBHOOK_SECRET /home/forge/gateflow-iot-bridge/.env
grep IOT_WEBHOOK_SECRET /home/forge/gateflow/.env
```

**Daemon crash fréquent:**
```bash
pm2 restart gateflow-bridge
pm2 logs gateflow-bridge --lines 100
```
