const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const merchantKey = process.env.NINEPAY_MERCHANT_KEY;
const checksumKey = process.env.NINEPAY_CHECKSUM_KEY;

async function request(path, data) {
  const time = Math.floor(Date.now() / 1000);
  
  const sortedKeys = Object.keys(data).sort();
  const formParts = sortedKeys.map(k => `${k}=${encodeURIComponent(data[k])}`);
  const message = 'POST\nhttps://sand-payment.9pay.vn' + path + '\n' + time + '\n' + formParts.join('&');
  
  const signature = crypto.createHmac('sha256', checksumKey).update(message).digest('base64');
  
  const config = {
    method: 'POST',
    url: 'https://sand-payment.9pay.vn' + path,
    headers: {
      'Date': time.toString(),
      'Authorization': 'Signature ' + signature,
      'Content-Type': 'application/json'
    },
    data: data
  };
  
  try {
    const res = await axios(config);
    console.log(`SUCCESS [${data.amount}]:`, res.data);
  } catch (err) {
    if (err.response) {
      console.log(`ERROR [${data.amount}]: ${err.response.status}`, err.response.data);
    } else {
      console.log(`ERROR [${data.amount}]:`, err.message);
    }
  }
}

async function run() {
  await request('/disbursement/create', {
    request_id: 'test' + Date.now(),
    amount: 46867, // The successful amount
    description: 'UCTalent Freelance Disbursement',
    bank_code: 'BIDV',
    account_name: 'NGUYEN VAN A',
    account_no: '1023020330000',
    account_type: '0'
  });
  
  await request('/disbursement/create', {
    request_id: 'test' + (Date.now() + 1),
    amount: 23439, // The failing amount
    description: 'UCTalent Freelance Disbursement',
    bank_code: 'BIDV',
    account_name: 'NGUYEN VAN A',
    account_no: '1023020330000',
    account_type: '0'
  });
}
run();
