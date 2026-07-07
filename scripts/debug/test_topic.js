const { rpc, nativeToScVal } = require('@stellar/stellar-sdk');
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');

async function test() {
  try {
    const topicXdr = nativeToScVal("uctalent", { type: "symbol" }).toXDR("base64");
    console.log("Topic XDR:", topicXdr);
    const response = await rpcServer.getEvents({
      startLedger: 2927760,
      filters: [{
        type: "contract",
        topics: [[topicXdr]]
      }],
      limit: 10
    });
    console.log("Found events:", response.events.length);
  } catch(e) {
    console.error(e.message);
  }
}
test();
