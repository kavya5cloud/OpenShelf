import pg from 'pg';
import { SCHEMA } from './schema.js';
import { seed } from './seed.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates (no timezone drift).
pg.types.setTypeParser(1082, (v) => v);

let pool;
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new ApiError(503, 'The database isn\'t connected yet. Add a Postgres database to the Vercel project (see README).');
    // Small pool: each serverless instance only needs a few connections.
    // sslmode=require already means a full certificate check in pg 8; say so
    // explicitly so it stays that way in pg 9 (and pg stops warning about it).
    pool = new pg.Pool({ connectionString: connectionString.replace(/sslmode=require\b/, 'sslmode=verify-full'), max: 5, idleTimeoutMillis: 5000 });
  }
  return pool;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

// Run fn(client) inside BEGIN/COMMIT; roll back if it throws.
export async function transaction(fn) {
  const c = await getPool().connect();
  try {
    await c.query('begin');
    const result = await fn(c);
    await c.query('commit');
    return result;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Create the tables and load the demo data the first time the app runs, so a
// fresh deployment works with no setup step. Runs once per server instance.
let ready = null;
export function ensureDatabase() {
  ready ??= transaction(async (c) => {
    await c.query('select pg_advisory_xact_lock(7426581)'); // two cold starts at once don't both seed
    await c.query(SCHEMA);
    const { rows: [{ n }] } = await c.query('select count(*)::int n from users');
    if (n === 0) await seed(c);
  }).catch((e) => { ready = null; throw e; });
  return ready;
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new ApiError(status, message); };
