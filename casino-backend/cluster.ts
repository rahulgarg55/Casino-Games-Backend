import cluster from 'cluster';
import os from 'os';
import process from 'process';
import net from 'net';

const numCPUs = os.cpus().length;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

interface WorkerMetrics {
  pid: number;
  memory: number;
  uptime: number;
  requests: number;
  lastReport: number;
}

const workerMetrics: Record<number, WorkerMetrics> = {};

if (cluster.isMaster) {
  console.log(`[Master] PID ${process.pid} is running. Spawning ${numCPUs} workers.`);

  // Sticky sessions: keep a map of workers
  const workers: cluster.Worker[] = [];
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    workers.push(worker);
  }

  // Create a TCP server to distribute connections (sticky sessions)
  const server = net.createServer({ pauseOnConnect: true }, (connection) => {
    // Simple sticky session: use remoteAddress to pick worker
    const workerIndex = connection.remoteAddress
      ? ipHash(connection.remoteAddress, numCPUs)
      : Math.floor(Math.random() * numCPUs);
    const worker = workers[workerIndex];
    if (worker && worker.isConnected()) {
      worker.send('sticky-session:connection', connection);
    } else {
      connection.destroy();
    }
  });
  server.listen(PORT, () => {
    console.log(`[Master] TCP server listening on port ${PORT}`);
  });

  // Listen for metrics from workers
  for (const worker of workers) {
    worker.on('message', (msg: any) => {
      if (msg.type === 'metrics') {
        workerMetrics[msg.pid] = {
          pid: msg.pid,
          memory: msg.memory,
          uptime: msg.uptime,
          requests: msg.requests,
          lastReport: Date.now(),
        };
      }
      if (msg.type === 'healthz') {
        // Health check response from worker
        console.log(`[Master] Health check from worker ${msg.pid}:`, msg.status);
      }
    });
  }

  // Periodically log metrics
  setInterval(() => {
    console.log('[Master] Aggregated worker metrics:', Object.values(workerMetrics));
  }, 10000);

  // Logging/monitoring
  cluster.on('online', (worker) => {
    console.log(`[Master] Worker ${worker.process.pid} is online.`);
  });
  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Master] Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`);
    const newWorker = cluster.fork();
    workers[workers.indexOf(worker)] = newWorker;
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Master] SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      workers.forEach((worker) => worker.kill());
      process.exit(0);
    });
  });
} else {
  // Worker: listen for sticky-session connections
  const http = require('http');
  const app = require('./src/server').default || require('./src/server');
  const server = http.createServer(app);

  // Error logging for debugging worker crashes
  process.on('uncaughtException', (err) => {
    console.error(`[Worker] PID ${process.pid} uncaughtException:`, err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Worker] PID ${process.pid} unhandledRejection:`, reason);
    process.exit(1);
  });

  process.on('message', (message: string, connection: any) => {
    if (message === 'sticky-session:connection' && connection) {
      server.emit('connection', connection);
      connection.resume();
    }
  });

  // Metrics reporting
  let requestCount = 0;
  server.on('request', () => {
    requestCount++;
  });
  setInterval(() => {
    if (process.send) {
      process.send({
        type: 'metrics',
        pid: process.pid,
        memory: process.memoryUsage().rss,
        uptime: process.uptime(),
        requests: requestCount,
      });
    }
  }, 5000);

  // Health check message handler
  process.on('message', (msg: any) => {
    if (msg === 'healthz') {
      if (process.send) {
        process.send({
          type: 'healthz',
          pid: process.pid,
          status: {
            memory: process.memoryUsage().rss,
            uptime: process.uptime(),
            requests: requestCount,
          },
        });
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`[Worker] PID ${process.pid} started, listening on port ${PORT}`);
  });

  // Graceful shutdown for worker
  process.on('SIGTERM', () => {
    console.log(`[Worker] PID ${process.pid} shutting down gracefully...`);
    server.close(() => {
      process.exit(0);
    });
  });
}

// Simple hash function for sticky sessions
function ipHash(ip: string, len: number): number {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash += ip.charCodeAt(i);
  }
  return hash % len;
} 