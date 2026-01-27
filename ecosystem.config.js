module.exports = {
  apps: [{
    name: 'gateflow-bridge',
    script: 'bridge-to-laravel.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: '/home/forge/.pm2/logs/gateflow-bridge-error.log',
    out_file: '/home/forge/.pm2/logs/gateflow-bridge-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
}
