# Checklist de déploiement - Bridge IoT

## ✅ Phase 1 : Préparation (une seule fois)

### Préparation du code
- [ ] Cloner le repo `gateflow-iot-bridge`
- [ ] Vérifier que `bridge-to-laravel.js` existe
- [ ] Vérifier que `package.json` existe
- [ ] Vérifier que `ecosystem.config.js` existe
- [ ] Vérifier que `.env.example` existe

### Installation sur Forge
```bash
# SSH sur le serveur
ssh forge@your-server.ip

# Cloner et installer
cd /home/forge
git clone https://github.com/your-org/gateflow-iot-bridge.git gateflow-iot-bridge
cd gateflow-iot-bridge
npm ci --production
```
- [ ] Répertoire `/home/forge/gateflow-iot-bridge` créé
- [ ] Dépendances npm installées

### Configuration
```bash
# Copier le fichier d'env
cp .env.example .env
nano .env
```

Remplir avec les vraies valeurs:
- [ ] `MQTT_BROKER_HOST` - généralement `eu1.cloud.thethings.network`
- [ ] `MQTT_BROKER_PORT` - généralement `1883`
- [ ] `MQTT_USERNAME` - identifiant TTN (ex: `gateflow@ttn`)
- [ ] `MQTT_PASSWORD` - clé API TTN (commence par `NNSXS.`)
- [ ] `MQTT_TOPIC_SUBSCRIBE` - généralement `v3/+/devices/+/up`
- [ ] `LARAVEL_HOST` - domaine du site (ex: `gateflow.on-forge.com`)
- [ ] `LARAVEL_PORT` - `443` pour HTTPS
- [ ] `LARAVEL_PROTOCOL` - `https`
- [ ] `LARAVEL_ENDPOINT` - `/api/iot/webhook`
- [ ] `IOT_WEBHOOK_SECRET` - un long secret aléatoire (doit correspondre à Laravel)
- [ ] `NODE_ENV` - `production`

**Important** : `IOT_WEBHOOK_SECRET` doit être **identique** dans:
- [ ] `/home/forge/gateflow-iot-bridge/.env`
- [ ] `/home/forge/gateflow/.env` (variable `IOT_WEBHOOK_SECRET`)

---

## ✅ Phase 2 : Configuration Daemon Forge

### Via Forge UI
1. [ ] Aller à **Servers** > Sélectionner le serveur
2. [ ] Cliquer sur **Daemons**
3. [ ] Cliquer sur **Create Daemon**
4. [ ] Remplir le formulaire :

| Champ | Valeur |
|-------|--------|
| Command | `cd /home/forge/gateflow-iot-bridge && pm2 start ecosystem.config.js --env production` |
| User | `forge` |
| Directory | `/home/forge/gateflow-iot-bridge` |

5. [ ] Cliquer sur **Create**

### Vérification du Daemon
```bash
# SSH sur le serveur
ssh forge@your-server.ip

# Vérifier le statut
pm2 status
```

Expected output:
```
┌─────────────────┬──────┬──────┬───────┬────────┬─────────┐
│ id │ name │ status │ ↺ │ memory │ watching
├─────────────────┼──────┼──────┼───────┼────────┼─────────┤
│ 0 │ gateflow-bridge │ online │ 0 │ 45.2 MB │ disabled │
└─────────────────┴──────┴──────┴───────┴────────┴─────────┘
```

- [ ] Daemon `gateflow-bridge` existe
- [ ] Status est `online`
- [ ] Pas de redémarrages fréquents (colonne `↺` = 0)

---

## ✅ Phase 3 : Vérification post-déploiement

### Logs du Bridge
```bash
pm2 logs gateflow-bridge --lines 50
```

Chercher ces lignes :
```
--- GATEFLOW BRIDGE DEMARRE ---
MQTT: eu1.cloud.thethings.network
API: https://gateflow.on-forge.com
[MQTT] Connecte
[MQTT] Abonne a v3/+/devices/+/up
```

- [ ] Bridge s'est démarré
- [ ] Bridge s'est connecté à MQTT
- [ ] Bridge s'est abonné au topic

### Vérifier la réception de messages
```bash
# Via TTN Console ou mqtt-client local
# Envoyer un message de test

# Puis vérifier les logs
pm2 logs gateflow-bridge | grep "\[IoT\]"
```

Chercher des lignes comme :
```
[IoT] Msg #1 de 70b3d5370011d7a6
[IoT] Msg #2 de 70b3d5370011d7a6
```

- [ ] Messages MQTT reçus
- [ ] Compteur de messages augmente

### Vérifier l'envoi à Laravel
```bash
# Via Laravel
cd /home/forge/gateflow
tail -f storage/logs/laravel.log | grep IoT
```

Chercher des lignes comme :
```
[2026-01-27 14:32:15] local.INFO: [IoT] Msg #1 de 70b3d5370011d7a6
```

- [ ] Webhooks reçus par Laravel
- [ ] Logs contiennent `[IoT]`

---

## ✅ Phase 4 : Intégration au déploiement Laravel

### Ajouter le script de redéploiement

1. [ ] Aller à **Sites** > Sélectionner le site > **Deploy**
2. [ ] Copier tout le **Deploy Script** actuel
3. [ ] Ajouter après le `npm build` :

```bash
# === IoT Bridge Deployment ===
if [ -d "/home/forge/gateflow-iot-bridge" ]; then
  cd /home/forge/gateflow-iot-bridge
  git pull origin main
  npm ci --production
  pm2 reload ecosystem.config.js --env production
fi
```

4. [ ] Sauvegarder

### Tester le script de redéploiement

```bash
# Option A : Via Forge UI > Deploy Now
# Option B : Via SSH
cd /home/forge/gateflow
# Exécuter le deploy script manuellement (copier/coller le contenu)
```

- [ ] Script de deploy s'exécute sans erreur
- [ ] Bridge redémarre (status: `online`)
- [ ] Pas de downtime du service

---

## ✅ Phase 5 : Nettoyage du repo principal

### Dans le repo `gateflow`

```bash
# testIOT/ ne contient plus le bridge
ls testIOT/
```

Vérifier que vous voyez :
- `server.js` ✓
- `mqtt-client.js` ✓
- `README.md` ✓
- **PAS** `bridge-to-laravel.js` ✗

- [ ] `bridge-to-laravel.js` supprimé de `testIOT/`
- [ ] `testIOT/package.json` allégé (plus de mqtt du bridge)
- [ ] `testIOT/README.md` mis à jour
- [ ] `testIOT/.env.example` simplifié

### Documentation mise à jour

- [ ] `docs/iot/BRIDGE_MIGRATION.md` créé
- [ ] `.env.example` du projet contient `IOT_WEBHOOK_SECRET`
- [ ] `.gitignore` de `testIOT/` ignore `node_modules`

---

## ✅ Phase 6 : Validation finale

### Checklist de sécurité
```bash
# Vérifier que le secret est identique
ssh forge@your-server.ip
diff <(grep "IOT_WEBHOOK_SECRET" /home/forge/gateflow-iot-bridge/.env) \
     <(grep "IOT_WEBHOOK_SECRET" /home/forge/gateflow/.env)
```

- [ ] Les deux secrets sont identiques
- [ ] `.env` ne contient pas de données sensibles en git
- [ ] `IOT_WEBHOOK_SECRET` est long et aléatoire (min 32 caractères)

### Checklist de performance
```bash
pm2 monit
```

Vérifier:
- [ ] CPU < 5%
- [ ] Mémoire < 200M (limite configurée)
- [ ] Pas de redémarrages fréquents
- [ ] Uptime augmente (pas de crash)

### Checklist de monitoring
- [ ] Daemon visible dans Forge UI
- [ ] Logs accessibles via Forge Dashboard
- [ ] Pas d'alertes de redémarrage fréquent

---

## 🔄 Mise à jour future

Quand vous mettez à jour le bridge :

1. [ ] Faire un commit dans `gateflow-iot-bridge`
2. [ ] Push sur `main`
3. [ ] Déclencher un déploiement du site Laravel (via Forge UI ou git)
4. [ ] Le script de deploy redéploiera automatiquement le bridge

---

## 🆘 Dépannage

### Le daemon ne démarre pas
```bash
pm2 logs gateflow-bridge | tail -20
pm2 restart gateflow-bridge
```

### Pas de messages reçus
```bash
# Vérifier MQTT
nc -zv eu1.cloud.thethings.network 1883

# Vérifier que les beacons envoient des données (TTN Console)
```

### Erreurs d'envoi à Laravel
```bash
# Vérifier le secret
grep IOT_WEBHOOK_SECRET /home/forge/gateflow-iot-bridge/.env
grep IOT_WEBHOOK_SECRET /home/forge/gateflow/.env
```

### Restart fréquent
```bash
# Vérifier la mémoire
pm2 monit

# Vérifier les erreurs
pm2 logs gateflow-bridge --lines 100
```

---

## ✅ Validation complète

Quand tout est coché :
- [ ] Bridge créé et cloné
- [ ] `.env` configuré
- [ ] Daemon PM2 créé et running
- [ ] Messages reçus de MQTT
- [ ] Webhooks envoyés à Laravel
- [ ] Deploy script intégré
- [ ] Documentation mise à jour
- [ ] Secrets cohérents
- [ ] Performance acceptable
- [ ] Monitoring en place

**🎉 Déploiement réussi !**
