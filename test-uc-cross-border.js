const axios = require('axios');
const crypto = require('crypto');

async function run() {
  const secret = 'uctalent-dev-secret-change-in-production';
  const payload = {
    amount: "2",
    sender_id: "2a2c6caa-0d83-4551-9d3a-6dfd444c55ff",
    receiver_id: "87af3765-8f2c-4947-8319-5f5b972e9d70",
    quote_id: "1c9ddc89-2cc5-412f-9818-da1b4b10b005", // I will fetch a real quote first
    idempotency_key: crypto.randomUUID() // Added idempotency_key to ensure distributionId is persisted for IPN Webhook
  };

  // First fetch a quote to use
  const quoteRes = await axios.get('http://localhost:8081/api/rate?type=firm&sell_amount=2&context=sep31');
  const quoteId = quoteRes.data.rate.id;
  payload.quote_id = quoteId;

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
