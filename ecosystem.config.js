module.exports = {
  apps: [{
    name: 'stockflow',
    script: './src/app.js',
    cwd: '/home/stockflow/stockflow',
    instances: 1,
    exec_mode: 'fork',
    
    // Configurações de ambiente
    env: {
      NODE_ENV: 'production',
      PORT: 2508,
      HOST: '0.0.0.0'
    },
    
    // Configurações de logs - consolidado em main.log
    out_file: './logs/main.log',
    error_file: './logs/main.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Configurações de restart
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'tests'],
    max_memory_restart: '500M',
    
    // Configurações de restart automático
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Configurações de cluster (se necessário no futuro)
    // instances: 'max',
    // exec_mode: 'cluster',
    
    // Configurações avançadas
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true,
    
    // Configurações de monitoramento
    pmx: true,
    automation: false,
    
    // Configurações específicas do StockFlow
    node_args: '--max-old-space-size=512',
    
    // Configurações de cron (se necessário)
    // cron_restart: '0 2 * * *', // Restart diário às 2h da manhã
    
    // Configurações de saúde
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true
  }]
};