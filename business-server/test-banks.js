const { NinePayGatewayService } = require('./dist/services/ninepay-gateway.service');
const crypto = require('crypto');
// Set globals if needed, but since it's compiled TS we can just use the built service
async function test() {
  const vcbRes1 = await NinePayGatewayService.lookupAccount('0888523111', 'VCB');
  console.log('VCB (code):', vcbRes1);

  const vcbRes2 = await NinePayGatewayService.lookupAccount('0888523111', 'Vietcombank');
  console.log('Vietcombank (shortName):', vcbRes2);
}
test();
