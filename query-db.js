const { DataSource } = require('typeorm');
const dataSource = new DataSource({
  type: 'postgres',
  host: '127.0.0.1',
  port: 5432,
  username: 'uct_rails_dev_root',
  password: 'DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB',
  database: 'uct_cross_border_dev',
});
dataSource.initialize().then(async () => {
  const result = await dataSource.query(`SELECT id, status, napas_ref_id, error_message FROM sep31_transactions ORDER BY created_at DESC LIMIT 5`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
