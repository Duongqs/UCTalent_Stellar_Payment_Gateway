const { DataSource } = require('typeorm');
async function run() {
  const ds = new DataSource({
    type: "postgres",
    host: "100.85.11.97",
    port: 15432,
    username: "uct_rails_dev_root",
    password: "xkGFNcvkY9SMiqPz0qvpxBXdKCWhUEUNsAKzYIoNkfe1eD8dtM",
    database: "uct_cross_border_dev",
  });
  await ds.initialize();
  const bankAccount = await ds.query(`SELECT * FROM user_bank_accounts WHERE kyc_id = 'df174c75-ee66-4683-a6a2-dea31024765a'`);
  console.log("Bank Account:", bankAccount);
  const profile = await ds.query(`SELECT stellar_wallet FROM bank_profiles WHERE customer_id = 'df174c75-ee66-4683-a6a2-dea31024765a'`);
  console.log("Bank Profile:", profile);
  await ds.destroy();
}
run().catch(console.error);
