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
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        // Bind to localhost; expect a reverse-proxy / Cloudflare Tunnel in front.
        // Override with HOSTNAME=0.0.0.0 in shell env if a different setup is needed.
        HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
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
      args: 'src/worker/index.ts',
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
  ],
};
