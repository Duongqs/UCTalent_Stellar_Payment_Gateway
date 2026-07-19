const axios = require('axios');
const crypto = require('crypto');

async function run() {
  const secret = 'uctalent-dev-secret-change-in-production';
  const payload = {
    amount: "2",
    sender_id: "2a2c6caa-0d83-4551-9d3a-6dfd444c55ff",
    receiver_id: "0feec18d-2145-45ea-b09f-919ddfcd626a",
    quote_id: "undefined"
  };

  const payloadString = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

  try {
    const res = await axios.post('http://localhost:8081/api/sep31/initiate', payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-uctalent-signature': signature
      }
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.log("Error status:", err.response?.status);
    console.log("Error body:", err.response?.data);
  }
}
run();
