const cluster = require('cluster');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

if (cluster.isPrimary) {
  console.log('🚀 Starting fast development mode with clustering...');

  const numCPUs = os.cpus().length;
  const workerCount = Math.max(1, Math.floor(numCPUs * 0.5)); // Use 50% for dev

  console.log(`📊 Spawning ${workerCount} workers...`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`🔄 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Watch for file changes and restart workers
  const chokidar = require('chokidar');
  const watcher = chokidar.watch(['src/**/*.ts'], {
    ignored: /node_modules/,
    persistent: true,
  });

  watcher.on('change', (path) => {
    console.log(`📝 File changed: ${path}`);
    console.log('🔄 Restarting workers...');

    for (const worker of Object.values(cluster.workers)) {
      worker?.kill();
    }

    setTimeout(() => {
      for (let i = 0; i < workerCount; i++) {
        cluster.fork();
      }
    }, 1000);
  });
} else {
  // Worker process with hot reloading
  const { spawn } = require('child_process');

  // Use the local ts-node-dev from node_modules
  const tsNodeDevPath = path.join(
    __dirname,
    'node_modules',
    '.bin',
    'ts-node-dev',
  );

  const devServer = spawn(
    tsNodeDevPath,
    ['--respawn', '--transpile-only', 'src/server.ts'],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
      cwd: __dirname,
    },
  );

  devServer.on('error', (error) => {
    console.error(`Worker ${process.pid} failed to start:`, error.message);
    process.exit(1);
  });

  devServer.on('exit', (code) => {
    console.log(`Worker ${process.pid} exited with code ${code}`);
    process.exit(code);
  });
}
