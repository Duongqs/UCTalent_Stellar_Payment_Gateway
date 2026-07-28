const axios = require('axios');
const crypto = require('crypto');

async function run() {
  const transactionId = '816eb73e-8016-4664-8e70-b6a8ea4df00f';
  const invoiceNo = '816eb73e-8016-4664-8e70-b6a8ea4df00f';
  const external_transaction_id = '9PAY-MANUAL-' + Date.now();
  const checksumKey = 'LODYjQRPfDL751cXHAatxlNaaBOVij9s'; // from uc-cross-border/.env

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
