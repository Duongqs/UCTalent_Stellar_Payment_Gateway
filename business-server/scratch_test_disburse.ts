import 'dotenv/config';
import { NinePayGatewayService } from './src/services/ninepay-gateway.service';
import { v4 as uuidv4 } from 'uuid';

async function run() {
  const bankCode = 'BIDV';
  const description = 'Test Payout';
  const kycName = 'NGUYEN VAN A'; // Matches the resolved account name

  console.log('--- Testing Successful Payout Account (1023020330000) ---');
  try {
    const invoiceNo1 = Date.now().toString() + Math.floor(Math.random() * 100000).toString();
    const result1 = await NinePayGatewayService.disburse(
      50000,
      invoiceNo1,
      bankCode,
      '1023020330000',
      description,
      kycName
    );
    console.log('Disbursement 1 Result:', result1);
  } catch (error: any) {
    console.error('Disbursement 1 Error:', error.message);
  }

  console.log('\n--- Testing Failed Payout Account (2034030440000) ---');
  try {
    const invoiceNo2 = (Date.now() + 1).toString() + Math.floor(Math.random() * 100000).toString();
    const result2 = await NinePayGatewayService.disburse(
      50000,
      invoiceNo2,
      bankCode,
      '2034030440000',
      description,
      kycName
    );
    console.log('Disbursement 2 Result:', result2);
  } catch (error: any) {
    console.error('Disbursement 2 Error:', error.message);
  }
}

run();
