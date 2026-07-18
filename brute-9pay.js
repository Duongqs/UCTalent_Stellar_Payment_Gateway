const crypto = require('crypto');
const axios = require('axios');

const merchantKey = 'wuuFRU';
const secretKey = 'wsbk79FW4VOrZnnLOSo7BbwkLqJF9xwBnUa';
const apiUrl = 'https://sand-payment.9pay.vn';
const method = 'POST';
const path = '/disbursement/check-account';
const time = Math.round(Date.now() / 1000).toString();
const params = { request_id: crypto.randomUUID(), bank_code: 'BIDV', account_no: '0888523111', account_type: '1' };
const httpQuery = Object.keys(params).sort().map(key => key + '=' + (params[key] || '')).join('&');

const payloads = [
  method + '\n' + apiUrl + path + '\n' + time + '\n' + httpQuery,
  method + '\n' + path + '\n' + time + '\n' + httpQuery,
  httpQuery, // The docs literally just say "Chữ ký sử dụng thuật toán HMAC-SHA256, B1, B2... Nối các tham số..."
  time + '\n' + httpQuery,
  method + '\n' + path + '\n' + httpQuery
];

async function test(message, idx) {
  const signature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
  const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}`;
  try {
    const res = await axios({
      method, url: `${apiUrl}${path}`, headers: { 'Authorization': authHeader, 'Date': time, 'Content-Type': 'application/x-www-form-urlencoded' }, data: new URLSearchParams(params).toString()
    });
    console.log(`Success ${idx}!!!`);
    return true;
  } catch(e) {
    console.log(`Failed ${idx} - ${e.response?.status}`);
    return false;
  }
}

(async () => {
  for (let i = 0; i < payloads.length; i++) {
    await test(payloads[i], i);
  }
})();
