const { xdr, scValToNative } = require('@stellar/stellar-sdk');
try {
  const scVal = xdr.ScVal.fromXDR("AAAADgAAAAh1Y3RhbGVudA==", "base64");
  console.log("Parsed:", scValToNative(scVal));
} catch(e) {
  console.error("Error:", e.message);
}
