const { rpc } = require('@stellar/stellar-sdk');
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');

async function test() {
  try {
    const response = await rpcServer.getEvents({
      startLedger: 2927768,
      limit: 1
    });
    console.log(response.events[0]);
  } catch(e) {
    console.error(e.message);
  }
}
test();
