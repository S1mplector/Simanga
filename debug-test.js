const fs = require('fs');
const path = require('path');

console.log('Starting debug test...');

try {
  console.log('Attempting to load mangadex adapter...');
  const mangadexPath = path.join(__dirname, 'src/adapters/mangadex.ts');
  console.log('Path exists:', fs.existsSync(mangadexPath));

  const mangadex = require('./src/adapters/mangadex').default;
  console.log('Adapter loaded successfully');
  console.log('Adapter ID:', mangadex.id);
  console.log('Adapter label:', mangadex.label);

} catch (error) {
  console.error('Error loading adapter:', error.message);
  console.error('Stack:', error.stack);
}
