const { DataSource } = require('typeorm');
const crypto = require('crypto');

async function test() {
  const dataSource = new DataSource({
    type: "postgres",
    host: "127.0.0.1",
    port: 5432,
    username: "uct_rails_dev_root",
    password: "DcglAQ2zrRNMiihqm1AMmVwBuY8q3ebB",
    database: "uct_cross_border_dev",
    entities: [__dirname + "/packages/core/src/entities/*.ts"],
    synchronize: false,
  });
  await dataSource.initialize();
  const res = await dataSource.createQueryBuilder()
    .select('tx.id')
    .from('sep31_transactions', 'tx')
    .where("REPLACE(tx.id::text, '-', '') LIKE :partial", { partial: '60ed3ec51cbb44e88b20d854acd639d1%' })
    .getOne();
  console.log(res);
  await dataSource.destroy();
}
test();
