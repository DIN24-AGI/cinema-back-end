import 'dotenv/config';
import { Pool, PoolConfig } from 'pg';

function buildConfig(): PoolConfig {
  const fromUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;
  const sslWanted =
    /sslmode=require|ssl=true/i.test(process.env.DATABASE_URL ?? '') ||
    (process.env.PGSSL ?? '').toLowerCase() === 'true';

  if (fromUrl) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: sslWanted ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: sslWanted ? { rejectUnauthorized: false } : undefined,
  };
}

async function main() {
  const pool = new Pool(buildConfig());

  let client;
  try {
    client = await pool.connect();
    const ver = await client.query('select version()');
    const now = await client.query('select now() as now');
    console.log('DB connection OK');
    console.log('version:', ver.rows[0].version);
    console.log('time:', now.rows[0].now);
    process.exit(0);
  } catch (err) {
    console.error('DB connection FAILED:', err);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

main();