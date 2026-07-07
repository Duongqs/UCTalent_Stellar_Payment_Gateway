const axios = require('axios');
axios.post('http://localhost:8081/sep31/initiate', {
  "amount": "10", "asset_code": "USDC", "sender_id": "bff89ada-8ba6-4b6c-bb47-ebc567236505", "receiver_id": "75e76688-4dce-42a5-b302-309d5a6fbb7e", "quote_id": "6173b1e4-b882-4139-8654-bd5aa0b84958"
}).then(res => console.log(res.data)).catch(err => console.error(err.response ? err.response.data : err.message));
