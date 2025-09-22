// Simple test to check if adapters can be imported and have basic functionality
const path = require('path');

async function testAdapterImport() {
  console.log('Testing adapter imports...');

  try {
    // Test importing the runner first
    const runnerPath = path.join(__dirname, 'src/adapters/adapters-tests/_runner.ts');
    console.log('Runner path exists:', require('fs').existsSync(runnerPath));

    // Try to import using ts-node with explicit path resolution
    const tsNode = require('ts-node');
    const runner = require(runnerPath);
    console.log('Runner imported successfully');

    // Test importing an adapter
    const adapterPath = path.join(__dirname, 'src/adapters/mangadex.ts');
    console.log('Adapter path exists:', require('fs').existsSync(adapterPath));

    const adapterModule = require(adapterPath);
    console.log('Adapter module type:', typeof adapterModule);

    if (adapterModule.default) {
      const adapter = adapterModule.default;
      console.log('Adapter ID:', adapter.id);
    }

    console.log('Adapter module keys:', Object.keys(adapterModule));

    console.log('Adapter import test completed');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAdapterImport();
