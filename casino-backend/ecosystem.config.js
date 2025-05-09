module.exports = {
  apps: [
    {
      name: 'casino-backend',
      script: 'dist/server.js',
      cwd: '/var/www/html/Basta-Casino-API/casino-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
