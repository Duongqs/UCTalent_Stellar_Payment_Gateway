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

  const bodyString = new URLSearchParams(params).toString();
  
  // Try 1: bodyString (with +)
  let message1 = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time + '\n' + bodyString;
  const signature1 = crypto.createHmac('sha256', secretKey).update(message1, 'utf8').digest('base64');
  
  // Try 2: sorted bodyString (with +)
  const sortedParams = {};
  Object.keys(params).sort().forEach(k => sortedParams[k] = params[k]);
  const sortedBodyString = new URLSearchParams(sortedParams).toString();
  let message2 = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time + '\n' + sortedBodyString;
  const signature2 = crypto.createHmac('sha256', secretKey).update(message2, 'utf8').digest('base64');
  
  // Try 3: buildCanonicalQuery but with encodeURIComponent
  const httpQuery3 = Object.keys(params).sort().map(key => key + '=' + encodeURIComponent(params[key] || '')).join('&');
  let message3 = method.toUpperCase() + '\n' + apiUrl + path + '\n' + time + '\n' + httpQuery3;
  const signature3 = crypto.createHmac('sha256', secretKey).update(message3, 'utf8').digest('base64');

  async function req(sig, name) {
    const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${sig}`;
    try {
      const res = await axios({
        method, url: `${apiUrl}${path}`, headers: { 'Authorization': authHeader, 'Date': time, 'Content-Type': 'application/x-www-form-urlencoded' }, data: bodyString
      });
      console.log(`Success ${name}!!!`, res.data);
    } catch(e) {
      console.log(`Failed ${name} - ${e.response?.status} - ${e.response?.data?.message}`);
    }
  }

  await req(signature1, "URLSearchParams body directly");
  await req(signature2, "URLSearchParams sorted directly");
  await req(signature3, "encodeURIComponent manually");
}

testWithSpaces();
