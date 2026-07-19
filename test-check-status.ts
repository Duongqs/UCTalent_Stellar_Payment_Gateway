import { config } from 'dotenv';
config();
import { NinePayGatewayService } from './packages/banking/src/services/ninepay-gateway.service';

const svc = new NinePayGatewayService({
  get: (k) => process.env[k]
} as any);

async function run() {
  const res = await svc.checkStatus('f4ecf2a0-9ad3-483e-80e0-45091a9d71c3');
  console.log(res);
}
run();
