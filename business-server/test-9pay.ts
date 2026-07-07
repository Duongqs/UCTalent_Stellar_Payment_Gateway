import 'dotenv/config';
import { NinePayGatewayService } from './src/services/ninepay-gateway.service';

async function run() {
  try {
    const result = await NinePayGatewayService.lookupAccount('1023020330000', 'BIDV');
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}
run();
