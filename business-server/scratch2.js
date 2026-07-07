const axios = require('axios');
const crypto = require('crypto');
function generateMockJwt() {
    const secret = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: 'http://localhost:8080',
      sub: 'GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodeBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const data = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
    const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${signature}`;
}

axios.post('http://localhost:8082/sep31/transactions', {
  "amount": "10", "asset_code": "USDC", "sender_id": "7ddb0385-3cae-47ea-979d-fc4079f53be2", "receiver_id": "9cd141a7-8c8f-4fec-9795-250ac139399f", "funding_method": "stellar", "fields": { "transaction": { "receiver_routing_number": "mock" } }
}, { headers: { 'Authorization': `Bearer ${generateMockJwt()}` } })
.then(res => console.log(res.data)).catch(err => console.error(err.response ? err.response.data : err.message));
