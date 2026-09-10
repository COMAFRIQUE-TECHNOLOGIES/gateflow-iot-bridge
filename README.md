# GateFlow IoT Bridge

Transport MQTT vers Laravel avec journal disque, reprise HTTP, messages techniques et métadonnées radio.

La version 2 exige un `MQTT_CLIENT_ID` stable et propre à chaque instance, un `SPOOL_DIRECTORY` persistant et un serveur qui renvoie `X-IoT-Durable: 1` après stockage SQL. Déployer le récepteur compatible avant ce bridge. Ne jamais partager le journal ou le client MQTT entre GateFlow et SODECI.

Installation des dépendances : `npm ci --omit=dev`. Vérification : `npm test`. Les paramètres sont décrits dans `.env.example`. Les fichiers `ops/` sont des modèles à adapter, leur présence ne configure pas la VM.

La documentation opérationnelle est centralisée dans le dépôt documentaire `sodeci-gateflow-docs`, fichier `operations/iot-reliability-rollout-2026-09-10.md`.
