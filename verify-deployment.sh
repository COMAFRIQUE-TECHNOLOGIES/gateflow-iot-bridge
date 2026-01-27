#!/bin/bash

# Script de vérification du déploiement du Bridge IoT
# À exécuter après le déploiement sur Forge pour vérifier que tout fonctionne

set -e

echo "🔍 Vérification du déploiement du Bridge IoT..."
echo ""

# Couleurs pour les outputs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BRIDGE_DIR="/home/forge/gateflow-iot-bridge"
LARAVEL_DIR="/home/forge/gateflow"

# 1. Vérifier que le répertoire existe
if [ ! -d "$BRIDGE_DIR" ]; then
    echo -e "${RED}✗ Erreur: Répertoire $BRIDGE_DIR introuvable${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Répertoire du bridge trouvé${NC}"

# 2. Vérifier que .env existe
if [ ! -f "$BRIDGE_DIR/.env" ]; then
    echo -e "${RED}✗ Erreur: Fichier .env introuvable dans $BRIDGE_DIR${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Fichier .env trouvé${NC}"

# 3. Vérifier que les variables d'env requises sont définies
cd "$BRIDGE_DIR"
if ! grep -q "MQTT_BROKER_HOST" .env; then
    echo -e "${RED}✗ Erreur: MQTT_BROKER_HOST manquant dans .env${NC}"
    exit 1
fi
if ! grep -q "LARAVEL_HOST" .env; then
    echo -e "${RED}✗ Erreur: LARAVEL_HOST manquant dans .env${NC}"
    exit 1
fi
if ! grep -q "IOT_WEBHOOK_SECRET" .env; then
    echo -e "${RED}✗ Erreur: IOT_WEBHOOK_SECRET manquant dans .env${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Variables d'environnement configurées${NC}"

# 4. Vérifier que node_modules est installé
if [ ! -d "$BRIDGE_DIR/node_modules" ]; then
    echo -e "${YELLOW}⚠ npm ci --production n'a pas été exécuté${NC}"
    echo "  Installation des dépendances..."
    npm ci --production
fi
echo -e "${GREEN}✓ Dépendances installées${NC}"

# 5. Vérifier que bridge-to-laravel.js existe
if [ ! -f "$BRIDGE_DIR/bridge-to-laravel.js" ]; then
    echo -e "${RED}✗ Erreur: bridge-to-laravel.js introuvable${NC}"
    exit 1
fi
echo -e "${GREEN}✓ bridge-to-laravel.js trouvé${NC}"

# 6. Vérifier que PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠ PM2 n'est pas installé globalement${NC}"
    echo "  Installation de PM2..."
    npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 installé${NC}"

# 7. Vérifier le statut du daemon
echo ""
echo "Statut du daemon PM2:"
if pm2 status | grep -q "gateflow-bridge"; then
    STATUS=$(pm2 status | grep "gateflow-bridge" | awk '{print $3}')
    if [ "$STATUS" = "online" ]; then
        echo -e "${GREEN}✓ gateflow-bridge est online${NC}"
    else
        echo -e "${YELLOW}⚠ gateflow-bridge est $STATUS${NC}"
        echo "  Tentative de redémarrage..."
        pm2 restart gateflow-bridge
    fi
else
    echo -e "${YELLOW}⚠ gateflow-bridge n'est pas lancé${NC}"
    echo "  Lancement du daemon..."
    pm2 start ecosystem.config.js --env production
fi

# 8. Vérifier la connectivité MQTT
echo ""
echo "Vérification de la connexion MQTT..."
MQTT_HOST=$(grep "MQTT_BROKER_HOST" .env | cut -d '=' -f 2)
MQTT_PORT=$(grep "MQTT_BROKER_PORT" .env | cut -d '=' -f 2 || echo "1883")

if nc -z -w 5 "$MQTT_HOST" "$MQTT_PORT" 2>/dev/null; then
    echo -e "${GREEN}✓ Connexion au broker MQTT possible ($MQTT_HOST:$MQTT_PORT)${NC}"
else
    echo -e "${YELLOW}⚠ Impossible de vérifier la connexion MQTT (peut être un problème réseau)${NC}"
fi

# 9. Vérifier les logs récents
echo ""
echo "Logs récents (dernières 10 lignes):"
echo "---"
pm2 logs gateflow-bridge --lines 10 --nostream | tail -10
echo "---"

# 10. Vérifier que le secret Laravel est identique
echo ""
echo "Vérification de la sécurité..."
BRIDGE_SECRET=$(grep "IOT_WEBHOOK_SECRET" "$BRIDGE_DIR/.env" | cut -d '=' -f 2 | xargs)
if [ -f "$LARAVEL_DIR/.env" ]; then
    LARAVEL_SECRET=$(grep "IOT_WEBHOOK_SECRET" "$LARAVEL_DIR/.env" | cut -d '=' -f 2 | xargs)
    if [ "$BRIDGE_SECRET" = "$LARAVEL_SECRET" ]; then
        echo -e "${GREEN}✓ IOT_WEBHOOK_SECRET cohérent entre Bridge et Laravel${NC}"
    else
        echo -e "${RED}✗ IOT_WEBHOOK_SECRET différent entre Bridge et Laravel!${NC}"
        echo -e "${YELLOW}  Bridge: ${BRIDGE_SECRET:0:20}...${NC}"
        echo -e "${YELLOW}  Laravel: ${LARAVEL_SECRET:0:20}...${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Impossible de vérifier Laravel .env${NC}"
fi

echo ""
echo -e "${GREEN}✅ Vérification terminée!${NC}"
echo ""
echo "Prochaines étapes:"
echo "1. Vérifier que les beacons envoient des données (TTN Console)"
echo "2. Consulter les logs: pm2 logs gateflow-bridge"
echo "3. Vérifier les webhooks Laravel: tail -f $LARAVEL_DIR/storage/logs/laravel.log"
