const crypto = require('crypto');
const axios = require('axios');

const generateAuthJwt = () => {
    const secret = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: 'http://localhost:8080',
      sub: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodeBase64Url = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url').replace(/=/g, '');
    const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url').replace(/=/g, '');
    return `${data}.${signature}`;
};

async function run() {
  try {
    const res = await axios.post('http://localhost:8082/sep31/transactions', {
      amount: "100",
      asset_code: "USDC",
      sender_id: "2a2c6caa-0d83-4551-9d3a-6dfd444c55ff",
      receiver_id: "0feec18d-2145-45ea-b09f-919ddfcd626a",
      funding_method: "stellar",
      destination_asset: "iso4217:VND",
      fields: { 
        transaction: { 
          receiver_routing_number: "VCB",
          receiver_account_number: "0011001234567"
        } 
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateAuthJwt()}`,
      }
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.log("Error status:", err.response?.status);
    console.log("Error body:", err.response?.data);
  }
}
run();
