const axios = require('axios');
axios.post('http://localhost:8085', {
  jsonrpc: '2.0',
  id: Date.now(),
  method: 'request_onchain_funds',
  params: {
    transaction_id: '8969609d-955d-46bf-9081-3bba53dd39d3',
    amount_in: '10',
    message: 'Awaiting escrow disbursement'
  }
}, { headers: { 'Content-Type': 'application/json' } })
.then(res => console.log(JSON.stringify(res.data, null, 2)))
.catch(err => console.error(err.response ? err.response.data : err.message));
