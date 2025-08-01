import cluster from 'cluster';
import os from 'os';
import { createServer } from 'http';
import app from './src/app';

const numCPUs = os.cpus().length;
const PORT = process.env.PORT || 3000;

// Use isMaster for compatibility with older Node.js versions
if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers based on CPU cores (use 75% of available cores for optimal performance)
  const workerCount = Math.max(1, Math.floor(numCPUs * 0.75));
  
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Handle worker crashes and restart them
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Load balancing with round-robin
  cluster.on('listening', (worker, address) => {
    console.log(`Worker ${worker.process.pid} listening on ${address.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (cluster.workers) {
      for (const worker of Object.values(cluster.workers)) {
        worker?.kill();
      }
    }
  });

} else {
  // Worker process
  const server = createServer(app);
  
  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} started on port ${PORT}`);
  });

  // Health check endpoint for load balancers
  server.on('request', (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200);
      res.end('OK');
    }
  });

  // Graceful shutdown for workers
  process.on('SIGTERM', () => {
    console.log(`Worker ${process.pid} shutting down`);
    server.close(() => {
      process.exit(0);
    });
  });
} 