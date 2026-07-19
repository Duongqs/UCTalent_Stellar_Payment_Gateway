const fs = require('fs');
const path = require('path');

const OLD_ISSUER = 'GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF';
const NEW_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const files = [
  '.env',
  'apps/api/src/sep31/sep31.controller.ts',
  'packages/stellar/src/services/sep31-transaction.service.ts',
  'apps/api/test/sep31-flow.e2e-spec.ts',
  'check-ap-502.js',
  'test-ap.js',
  'config/anchor-config.toml',
  'anchor-platform/config/dev.assets.yaml',
  'scripts/e2e-tests/test-sep38.sh',
  'scripts/e2e-tests/test-sep31-e2e.sh'
];

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(OLD_ISSUER)) {
      content = content.split(OLD_ISSUER).join(NEW_ISSUER);
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Updated: ${file}`);
    }
  }
});
