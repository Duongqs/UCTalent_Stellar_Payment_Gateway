const axios = require('axios');

async function testOracleEndpoint() {
  console.log('Testing GET /api/exchange-rate endpoint...');
  try {
    const response = await axios.get('http://localhost:4000/api/exchange-rate');
    const data = response.data;
    
    if (data.rate && typeof data.rate === 'number' && data.rate > 0) {
      console.log('✅ PASS: Endpoint returns a valid positive exchange rate.');
      console.log(`   Returned Rate: ${data.rate} VND/USDC`);
    } else {
      console.error('❌ FAIL: Endpoint did not return a valid rate.', data);
      process.exit(1);
    }

    if (data.source === 'offchain_median') {
      console.log('✅ PASS: Source is properly labeled as offchain_median.');
    } else {
      console.error('❌ FAIL: Incorrect source label.', data);
      process.exit(1);
    }
    
    if (data.updated_at) {
      console.log('✅ PASS: updated_at timestamp is present.');
    } else {
      console.error('❌ FAIL: updated_at timestamp is missing.', data);
      process.exit(1);
    }
    
    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ FAIL: Failed to reach the oracle endpoint.', error.message);
    process.exit(1);
  }
}

testOracleEndpoint();
