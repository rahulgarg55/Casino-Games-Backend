const autocannon = require('autocannon');
const { spawn } = require('child_process');

async function runPerformanceTest() {
  console.log('🚀 Starting performance test...');

  // Start the clustered server
  const server = spawn('node', ['cluster.ts'], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    const result = await autocannon({
      url: 'http://localhost:3000',
      connections: 100,
      duration: 10,
      pipelining: 1,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('📊 Performance Results:');
    console.log(`Average Latency: ${result.latency.average}ms`);
    console.log(`Requests/sec: ${result.requests.average}`);
    console.log(`Total Requests: ${result.requests.total}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Timeouts: ${result.timeouts}`);
  } catch (error) {
    console.error('❌ Performance test failed:', error);
  } finally {
    // Cleanup
    server.kill('SIGTERM');
    process.exit(0);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runPerformanceTest();
}

module.exports = { runPerformanceTest };
