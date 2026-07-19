const axios = require('axios');
const crypto = require('crypto');
async function run() {
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
  const jwt = `${data}.${signature}`;
  try {
    const res = await axios.post('http://127.0.0.1:8082/sep38/quote', {
      sell_asset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
      buy_asset: 'iso4217:VND',
      sell_amount: '2',
      context: 'sep31'
    }, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    console.log(res.data);
  } catch (err) {
    console.log("Error:", err.response?.data || err.message);
  }
}
run();
