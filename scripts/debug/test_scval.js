const { scValToNative } = require('@stellar/stellar-sdk');
try {
  console.log("Parsing:", scValToNative("AAAADgAAAAh1Y3RhbGVudA=="));
} catch(e) {
  console.error("Error:", e.message);
}
