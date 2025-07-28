const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  console.log('✅ Cluster master is working');
  console.log(`📊 CPU cores: ${os.cpus().length}`);

  // Fork a single worker for testing
  const worker = cluster.fork();

  worker.on('online', () => {
    console.log('✅ Worker started successfully');
    setTimeout(() => {
      console.log('🔄 Shutting down test...');
      worker.kill();
      process.exit(0);
    }, 2000);
  });
} else {
  console.log(`✅ Worker ${process.pid} is running`);

  // Simulate some work
  setTimeout(() => {
    console.log(`✅ Worker ${process.pid} completed work`);
    process.exit(0);
  }, 1000);
}
