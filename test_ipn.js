const axios = require('axios');
const crypto = require('crypto');

async function test() {
  const payload = {
    invoice_no: '60ed3ec51cbb44e88b20d854acdPIT',
    transaction_id: '60ed3ec51cbb44e88b20d854acdPIT',
    external_transaction_id: '9PAY-FALLBACK-60ed3ec5-PIT',
    status: 'SUCCESS'
  };
  const payloadStr = JSON.stringify(payload);
  const resultB64 = Buffer.from(payloadStr).toString('base64');
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(resultB64 + 'LODYjQRPfDL751cXHAatxlNaaBOVij9s')
    .digest('hex')
    .toUpperCase();

  try {
    const res = await axios.post('http://localhost:8081/api/ipn', {
      result: resultB64,
      checksum: expectedChecksum
    });
    console.log('Status:', res.status);
    console.log('Data:', res.data);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}
test();
