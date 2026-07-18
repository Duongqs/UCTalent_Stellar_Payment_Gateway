const crypto = require('crypto');
const axios = require('axios');

const merchantKey = 'wuuFRU';
const secretKey = 'wsbk79FW4VOrZnnLOSo7BbwkLqJF9xwBnUa';
const apiUrl = 'https://sand-payment.9pay.vn';

function testSignature(includeHost) {
  const method = 'POST';
  const path = '/disbursement/check-account';
  const time = Math.round(Date.now() / 1000).toString();
  const requestId = crypto.randomUUID();
  const params = {
    request_id: requestId,
    bank_code: 'BIDV',
    account_no: '0888523111',
    account_type: '1'
  };

  const httpQuery = Object.keys(params).sort().map(key => key + '=' + (params[key] || '')).join('&');
  
  let message = '';
  if (includeHost) {
    message = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time;
  } else {
    message = method.toUpperCase() + '\n' + path + '\n' + time;
  }
  if (httpQuery) {
    message += '\n' + httpQuery;
  }

  const signature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
  const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}`;

  return axios({
    method,
    url: `${apiUrl}${path}`,
    headers: {
      'Authorization': authHeader,
      'Date': time,
      'Content-Type': 'application/json'
    },
    data: params
  }).then(res => {
    console.log(`Success with includeHost=${includeHost}:`, res.data);
  }).catch(err => {
    console.error(`Error with includeHost=${includeHost}:`, err.response ? err.response.status : err.message);
  });
}

(async () => {
  await testSignature(true);
  await testSignature(false);
})();
