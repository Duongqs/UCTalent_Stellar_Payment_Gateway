const crypto = require('crypto');
const axios = require('axios');

const merchantKey = 'wuuFRU';
const secretKey = 'wsbk79FW4VOrZnnLOSo7BbwkLqJF9xwBnUa';
const apiUrl = 'https://sand-payment.9pay.vn';

function buildCanonicalQuery(params) {
  const sortedParams = {};
  Object.keys(params).sort().forEach(key => {
    sortedParams[key] = params[key] || '';
  });
  return new URLSearchParams(sortedParams).toString();
}

async function request(method, path, params) {
  const time = Math.round(Date.now() / 1000).toString();
  const httpQuery = buildCanonicalQuery(params);
  let message = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time;
  if (httpQuery) {
    message += '\n' + httpQuery;
  }
  const signature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
  const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}`;

  const config = {
    method,
    url: `${apiUrl}${path}`,
    headers: {
      'Authorization': authHeader,
      'Date': time,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: new URLSearchParams(params).toString(),
  };

  try {
    const response = await axios(config);
    console.log("Success:", response.data);
  } catch (error) {
    console.log("Error:", error.response.status, error.response.data);
  }
}

request('POST', '/disbursement/create', {
  request_id: crypto.randomUUID().replace(/-/g, '').substring(0, 30),
  amount: String(70157),
  description: 'Payment for milestone d8d883fb',
  bank_code: 'BIDV',
  account_name: 'HUYNH NGOC HUY',
  account_no: '0888523111',
  account_type: '0',
});
