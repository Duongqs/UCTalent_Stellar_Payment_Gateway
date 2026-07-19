const axios = require('axios');
const crypto = require('crypto');

async function run() {
  const secret = 'uctalent-dev-secret-change-in-production';
  const payload = {
    amount: "2",
    sender_id: "2a2c6caa-0d83-4551-9d3a-6dfd444c55ff",
    receiver_id: "0feec18d-2145-45ea-b09f-919ddfcd626a"
  };

  // Fetch a quote WITH sell_asset=iso4217:USD
  const quoteRes = await axios.get('http://localhost:8081/api/rate?type=firm&sell_asset=iso4217:USD&buy_asset=iso4217:VND&sell_amount=2&context=sep31');
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
