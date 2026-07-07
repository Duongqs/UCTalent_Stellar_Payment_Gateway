const axios = require('axios');

// Exchange rate is fetched off-chain from median of multiple sources:
// Binance P2P USDT/VND, CoinGecko USDC/USD+VND, VCB rate.
// Connects to the business-server oracle.
async function fetchCurrentRate() {
  const fallback = parseInt(process.env.ORACLE_FALLBACK_RATE || '25450', 10);
  try {
    const res = await axios.get('http://localhost:8081/rate?type=indicative&sell_amount=1');
    if (res.data && res.data.rate) {
      return parseFloat(res.data.rate);
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch rate from oracle, using fallback', err.message);
  }
  return fallback;
}

module.exports = {
  fetchCurrentRate
};
