const axios = require('axios');
const crypto = require('crypto');

async function run() {
  const transactionId = 'efeb67db-1fe2-40b4-9a76-3001b667ca82';
  const invoiceNo = 'efeb67db-1fe2-40b4-9a76-3001b667ca82';
  const external_transaction_id = '527945614851241';
  const checksumKey = 'LODYjQRPfDL751cXHAatxlNaaBOVij9s'; 

  let truncatedTxId = transactionId.replace(/-/g, '').substring(0, 30);
  const payload = {
    invoice_no: invoiceNo,
    transaction_id: truncatedTxId,
    external_transaction_id,
    status: 'SUCCESS'
  };

  const payloadStr = JSON.stringify(payload);
  const resultB64 = Buffer.from(payloadStr).toString('base64');
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(resultB64 + checksumKey)
    .digest('hex')
    .toUpperCase();

  try {
    const res = await axios.post('http://localhost:8081/api/ipn', {
      result: resultB64,
      checksum: expectedChecksum
    });
    console.log('IPN triggered successfully:', res.data);
  } catch (err) {
    console.error('IPN error:', err.response ? err.response.data : err.message);
  }
}
run();
