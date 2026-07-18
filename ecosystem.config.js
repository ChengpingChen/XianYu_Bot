module.exports = {
  apps: [{
    name: 'goofish-bot',
    script: 'C:/Users/admin/Desktop/bot/bot.js',
    cwd: 'C:/Users/admin/Desktop/bot',
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'C:/Users/admin/Desktop/bot/logs/pm2-error.log',
    out_file: 'C:/Users/admin/Desktop/bot/logs/pm2-out.log',
  }]
};
