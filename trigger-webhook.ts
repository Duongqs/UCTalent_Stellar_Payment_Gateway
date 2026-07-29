import axios from 'axios';
import * as crypto from 'crypto';
import { config } from 'dotenv';
config();

async function run() {
  const transactionId = "f4ecf2a0-9ad3-483e-80e0-45091a9d71c3";
  const callbackPayload = {
    distributionId: "f13309e6-5b99-461e-8e8d-e58b98e23301",
    anchorTxId: transactionId,
    invoiceNo: transactionId,
    status: "success",
    externalTxId: "526605737030721",
    ninePayInvoiceNo: transactionId,
    vndAmount: 46838,
    taxWithheld: 5204,
    napasRefId: "526605737030721",
    stellarTxHash: "a367703919302723...", // We don't have the real stellarTxHash, wait, it's in DB
    clearingId: transactionId,
  };

  const callbackPayloadString = JSON.stringify(callbackPayload);
  const secret = process.env.CROSS_BORDER_WEBHOOK_SECRET;
  if (!secret) throw new Error('CROSS_BORDER_WEBHOOK_SECRET is not configured');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(callbackPayloadString)
    .digest('hex');

  try {
    const res = await axios.post('http://localhost:4000/api/v2/cross-border/settlement-callback', callbackPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UCTALENT-SIGNATURE': `sha256=${signature}`,
      },
    });
    console.log(res.data);
  } catch (err: any) {
    console.error(err.response?.data || err.message);
  }
}
run();
