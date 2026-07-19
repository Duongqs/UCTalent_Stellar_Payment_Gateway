const express = require('express');
const axios = require('axios');
const app = express();

app.post('/test', (req, res) => {
  res.status(502).json({
    error: 'ambiguous_timeout',
    message: 'Transaction is in an ambiguous state due to network timeout. Please contact support.'
  });
});

const server = app.listen(9999, async () => {
  try {
    await axios.post('http://localhost:9999/test');
  } catch (err) {
    const customMessage = err.response?.data?.message || err.message;
    console.log("Axios error message:", err.message);
    console.log("Custom message:", customMessage);
  }
  server.close();
});
