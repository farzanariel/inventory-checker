// pm2 process manifest. Run on the VPS:
//
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup    # follow the printed instructions to enable boot persistence
//
// Both processes share the same SQLite file at data/data.db. Logs go to ./logs/.
// Update on deploy:  git pull && npm install && npm run build && pm2 reload all

const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'inventory-app',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      // Bind on all interfaces so the host reverse proxy can reach Next.js.
      // Public traffic still goes through Nginx/Cloudflare; PORT 3002 avoids
      // conflicts with other services.
      args: ['start', '-H', '0.0.0.0'],
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
      },
      out_file: path.join(__dirname, 'logs', 'app.out.log'),
      error_file: path.join(__dirname, 'logs', 'app.err.log'),
      merge_logs: true,
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
    {
      name: 'inventory-worker',
      cwd: __dirname,
      script: 'node_modules/.bin/tsx',
      interpreter: 'node',
      args: '--env-file .env src/worker/index.ts',
      env: {
        NODE_ENV: 'production',
      },
      out_file: path.join(__dirname, 'logs', 'worker.out.log'),
      error_file: path.join(__dirname, 'logs', 'worker.err.log'),
      merge_logs: true,
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
      // Give the worker time to finish its current tick on graceful shutdown
      kill_timeout: 5000,
    },
    {
      name: 'inventory-auto-deploy',
      cwd: __dirname,
      script: 'scripts/auto-deploy.sh',
      interpreter: 'bash',
      env: {
        DEPLOY_REMOTE: 'origin',
        DEPLOY_BRANCH: 'main',
        DEPLOY_POLL_INTERVAL_SECS: '30',
      },
      out_file: path.join(__dirname, 'logs', 'auto-deploy.out.log'),
      error_file: path.join(__dirname, 'logs', 'auto-deploy.err.log'),
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
