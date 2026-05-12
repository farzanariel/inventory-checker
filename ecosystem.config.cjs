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
      // Bind to Docker bridge IP so Traefik (Docker) can reach via host.docker.internal.
      // 10.0.0.1 is docker0 — not publicly exposed, only reachable from containers on this host.
      // PORT 3002 avoids conflict with Paperclip server on 3100 (Next.js binds PORT+100 internally).
      args: ['start', '-H', '10.0.0.1'],
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
