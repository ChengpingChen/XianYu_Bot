module.exports = {
  apps: [{
    name: 'goofish-bot',
    script: './bot.js',
    cwd: __dirname,
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
  }]
};
