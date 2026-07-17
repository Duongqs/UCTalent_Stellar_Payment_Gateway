const crypto = require('crypto');
const axios = require('axios');

const merchantKey = 'wuuFRU';
const secretKey = 'wsbk79FW4VOrZnnLOSo7BbwkLqJF9xwBnUa';
const apiUrl = 'https://sand-payment.9pay.vn';

async function testWithSpaces() {
  const method = 'POST';
  const path = '/disbursement/create';
  const time = Math.round(Date.now() / 1000).toString();
  const params = { 
    request_id: crypto.randomUUID(), 
    bank_code: 'BIDV', 
    account_no: '0888523111', 
    account_type: '1',
    amount: '10000',
    description: 'Test space',
    account_name: 'NGUYEN VAN A'
  };

  const httpQuery = Object.keys(params).sort().map(key => key + '=' + (params[key] || '')).join('&');
  
  let message = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time + '\n' + httpQuery;
  const signature = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
  const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}`;

  try {
    const res = await axios({
      method, url: `${apiUrl}${path}`, headers: { 'Authorization': authHeader, 'Date': time, 'Content-Type': 'application/x-www-form-urlencoded' }, data: new URLSearchParams(params).toString()
    });
    console.log(`Success!!!`, res.data);
  } catch(e) {
    console.log(`Failed - ${e.response?.status} - ${e.response?.data?.message}`);
  }
}

testWithSpaces();
