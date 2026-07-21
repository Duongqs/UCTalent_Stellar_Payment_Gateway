const { DataSource } = require('typeorm');
const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/uctalent_cross_border',
});
dataSource.initialize().then(async () => {
  const result = await dataSource.query(`SELECT id, status, "errorMessage" FROM sep31_transactions WHERE status = 'error' OR "errorMessage" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 5`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
