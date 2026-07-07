const { rpc } = require('@stellar/stellar-sdk');
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');

async function test() {
  try {
    const response = await rpcServer.getEvents({
      startLedger: 2927700,
      filters: [{
        type: "contract",
        topics: [
          ["AAAADgAAAAh1Y3RhbGVudA=="],
          ["AAAADgAAABByZWZlcnJhbF9zZXR0bGVk", "AAAADgAAABFyZWxlYXNlX21pbGVzdG9uZQ=="]
        ]
      }],
      limit: 100
    });
    console.log("Found events by topic:", response.events.length);
    if(response.events.length > 0) {
      console.log("First event contractId:", response.events[0].contractId.toString());
    }
  } catch(e) {
    console.error(e.message);
  }
}
test();
