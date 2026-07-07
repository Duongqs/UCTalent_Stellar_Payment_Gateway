const { rpc } = require('@stellar/stellar-sdk');
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');

async function test() {
  try {
    const response = await rpcServer.getEvents({
      startLedger: 2927760,
      filters: [{
        type: "contract",
        topics: [["AAAADgAAAAh1Y3RhbGVudA=="]]
      }],
      limit: 10
    });
    console.log("Found events:", response.events.length);
  } catch(e) {
    console.error(e.message);
  }
}
test();
