const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const merchantKey = process.env.NINEPAY_MERCHANT_KEY;
const secretKey = process.env.NINEPAY_SECRET_KEY;

function buildCanonicalQuery(params) {
  if (!params || Object.keys(params).length === 0) return '';
  const sortedParams = {};
  Object.keys(params).sort().forEach(key => {
    sortedParams[key] = params[key] || '';
  });
  return new URLSearchParams(sortedParams).toString();
}

function createSignature(method, path, time, params) {
  const httpQuery = buildCanonicalQuery(params);
  let message = method.toUpperCase() + '\nhttps://sand-payment.9pay.vn' + path + '\n' + time;
  if (httpQuery) {
    message += '\n' + httpQuery;
  }
  const sig = crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('base64');
  return sig;
}

async function request(path, params) {
  const time = Math.round(Date.now() / 1000).toString();
  const signature = createSignature('POST', path, time, params);
  const authHeader = `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}`;

  const config = {
    method: 'POST',
    url: 'https://sand-payment.9pay.vn' + path,
    headers: {
      'Authorization': authHeader,
      'Date': time,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: new URLSearchParams(params).toString(),
    timeout: 15000,
  };

  try {
    const res = await axios(config);
    console.log(`SUCCESS [${params.amount}]:`, res.data);
  } catch (err) {
    if (err.response) {
      console.log(`ERROR [${params.amount}]: ${err.response.status}`, err.response.data);
    } else {
      console.log(`ERROR [${params.amount}]:`, err.message);
    }
  }
}

async function run() {
  await request('/disbursement/create', {
    request_id: crypto.randomUUID().replace(/-/g, '').substring(0, 30),
    amount: "46867",
    description: 'UCTalent Freelance Disbursement',
    bank_code: 'BIDV',
    account_name: 'NGUYEN VAN A',
    account_no: '1023020330000',
    account_type: '0'
  });
  
  await request('/disbursement/create', {
    request_id: crypto.randomUUID().replace(/-/g, '').substring(0, 30),
    amount: "23439",
    description: 'UCTalent Freelance Disbursement',
    bank_code: 'BIDV',
    account_name: 'NGUYEN VAN A',
    account_no: '1023020330000',
    account_type: '0'
  });

  await request('/disbursement/create', {
    request_id: crypto.randomUUID().replace(/-/g, '').substring(0, 30),
    amount: "70314",
    description: 'UCTalent Freelance Disbursement',
    bank_code: 'BIDV',
    account_name: 'NGUYEN VAN A',
    account_no: '1023020330000',
    account_type: '0'
  });
}
run();
