require('dotenv').config();
const NinePayClient = require('./src/ninepay-client');
const crypto = require('crypto');

async function test() {
  try {
    const client = new NinePayClient();
    const requestId = `test${Date.now()}`;
    console.log("Verifying platform account...");
    const verify = await client.verifyAccount({
      requestId: requestId + "v",
      bankCode: 'BIDV',
      accountNo: '96311300000170179',
      accountType: '0'
    });
    console.log("Verify result:", verify);

    if (verify.status === 5) {
      console.log("Transferring 10000 VND to platform account...");
      const transfer = await client.requestTransfer({
        requestId: requestId + "t",
        amount: 20000,
        description: 'Test platform payout',
        bankCode: 'BIDV',
        accountName: verify.account_name || 'UCTALENT1',
        accountNo: '96311300000170179',
        accountType: '0'
      });
      console.log("Transfer result:", transfer);
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
test();
