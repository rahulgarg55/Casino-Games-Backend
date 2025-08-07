const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// Define a directory and file paths for testing
const testDir = path.join(__dirname, 'test-dir');
const testFile = path.join(testDir, 'example.txt');
const largeFile = path.join(testDir, 'large-file.txt');
const logFile = path.join(testDir, 'log.txt');

// Helper function to log memory usage
function logMemoryUsage(label) {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`${label}: ${used.toFixed(2)} MB`);
}

// 1. Create a directory synchronously (only if it doesn't exist)
function createDirectory() {
  try {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
      console.log('Directory created:', testDir);
    } else {
      console.log('Directory already exists:', testDir);
    }
  } catch (err) {
    console.error('Error creating directory:', err.message);
  }
}

// 2. Synchronous file write (fs.writeFileSync)
function writeFileSyncExample() {
  logMemoryUsage('Before sync write');
  try {
    const data = 'Hello, this is a synchronous write!\n';
    fs.writeFileSync(testFile, data);
    console.log('Synchronous write successful:', testFile);
  } catch (err) {
    console.error('Error in sync write:', err.message);
  }
  logMemoryUsage('After sync write');
}

// 3. Asynchronous file write (fs.writeFile - callback-based)
function writeFileCallback() {
  logMemoryUsage('Before callback write');
  const data = 'Hello, this is a callback-based async write!\n';
  fs.writeFile(testFile, data, { flag: 'a' }, (err) => {
    if (err) {
      console.error('Error in callback write:', err.message);
      return;
    }
    console.log('Callback-based write successful:', testFile);
    logMemoryUsage('After callback write');
  });
}

// 4. Promise-based file write (fs.promises.writeFile)
async function writeFilePromise() {
  logMemoryUsage('Before promise write');
  try {
    const data = 'Hello, this is a promise-based async write!\n';
    await fsPromises.writeFile(testFile, data, { flag: 'a' });
    console.log('Promise-based write successful:', testFile);
    logMemoryUsage('After promise write');
  } catch (err) {
    console.error('Error in promise write:', err.message);
  }
}

// 5. Reading a file synchronously (fs.readFileSync)
function readFileSync() {
  try {
    const data = fs.readFileSync(testFile, 'utf8');
    console.log('Synchronous read:', data);
  } catch (err) {
    console.error('Error in sync read:', err.message);
  }
}

// 6. Reading a file asynchronously (fs.readFile - callback-based)
function readFileCallback() {
  fs.readFile(testFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Error in callback read:', err.message);
      return;
    }
    console.log('Callback-based read:', data);
  });
}

// 7. Reading a file with promises (fs.promises.readFile)
async function readFilePromise() {
  try {
    const data = await fsPromises.readFile(testFile, 'utf8');
    console.log('Promise-based read:', data);
  } catch (err) {
    console.error('Error in promise read:', err.message);
  }
}

// 8. Streaming write for large data
function writeStreamExample() {
  logMemoryUsage('Before stream write');
  const writeStream = fs.createWriteStream(largeFile);
  const largeData = 'x'.repeat(10 * 1024 * 1024); // 10 MB of data
  writeStream.write(largeData);
  writeStream.end();
  writeStream.on('finish', () => {
    console.log('Stream write successful:', largeFile);
    logMemoryUsage('After stream write');
  });
  writeStream.on('error', (err) => {
    console.error('Error in stream write:', err.message);
  });
}

// 9. Streaming read for large data
function readStreamExample() {
  const readStream = fs.createReadStream(largeFile, { encoding: 'utf8' });
  readStream.on('data', (chunk) => {
    console.log('Stream read chunk size:', chunk.length, 'bytes');
  });
  readStream.on('end', () => {
    console.log('Stream read completed');
  });
  readStream.on('error', (err) => {
    console.error('Error in stream read:', err.message);
  });
}

// 10. File stats (fs.promises.stat)
async function getFileStats() {
  try {
    const stats = await fsPromises.stat(testFile);
    console.log('File stats:');
    console.log(`  Size: ${stats.size} bytes`);
    console.log(`  Is File: ${stats.isFile()}`);
    console.log(`  Last Modified: ${stats.mtime}`);
  } catch (err) {
    console.error('Error getting file stats:', err.message);
  }
}

// 11. Append to a file (fs.promises.appendFile)
async function appendFileExample() {
  try {
    const data = 'Appended data at ' + new Date().toISOString() + '\n';
    await fsPromises.appendFile(logFile, data);
    console.log('Append successful:', logFile);
  } catch (err) {
    console.error('Error in append:', err.message);
  }
}

// 12. Delete a file (fs.promises.unlink)
async function deleteFileExample() {
  try {
    await fsPromises.unlink(largeFile);
    console.log('File deleted:', largeFile);
  } catch (err) {
    console.error('Error deleting file:', err.message);
  }
}

// Main function to run all examples
async function main() {
  console.log('Starting fs demo...\n');
  
  createDirectory();
  writeFileSyncExample();
  await writeFilePromise();
  writeFileCallback();
  readFileSync();
  readFileCallback();
  await readFilePromise();
  writeStreamExample();
  readStreamExample();
  await getFileStats();
  await appendFileExample();
  await deleteFileExample();
  
  console.log('\nAll fs operations completed!');
}

// Run the main function and handle errors
main().catch((err) => {
  console.error('Error in main:', err.message);
});