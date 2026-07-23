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
  const profiles = await ds.query("SELECT customer_id, created_at, encrypted_account FROM bank_profiles ORDER BY created_at DESC");
  console.log(profiles);
  await ds.destroy();
}
run().catch(console.error);
