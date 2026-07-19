const crypto = require('crypto');
const axios = require('axios');

const secret = 'uctalent-dev-secret-change-in-production';
const payloadObj = {
  userId: "2a2c6caa-0d83-4551-9d3a-6dfd444c55ff",
  kycId: "0feec18d-2145-45ea-b09f-919ddfcd626a",
  bankCode: "VCB",
  accountNumber: "0011001234567", // fake account number just to see if it registers
  accountName: "GOOGLE COMPANY"
};

const payloadString = JSON.stringify(payloadObj);
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

axios.post('http://localhost:8081/api/v1/bank-vault/register', payloadObj, {
  headers: {
    'Content-Type': 'application/json',
    'X-UCTALENT-SIGNATURE': signature,
  }
}).then(res => {
  console.log("Success:", res.data);
}).catch(err => {
  console.error("Error:", err.response ? err.response.data : err.message);
});
