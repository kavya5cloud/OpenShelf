// The app sets up its own database on first run, so these are optional:
//   npm run db:setup → create tables and load demo data now (if empty)
//   npm run db:reset → wipe everything and start again from the demo data
import { transaction, ensureDatabase, closePool } from '../api/_lib/db.js';
import { DROP } from '../api/_lib/schema.js';

const mode = process.argv[2];
if (mode !== 'setup' && mode !== 'reset') {
  console.error('Usage: node scripts/db.mjs setup|reset');
  process.exit(1);
}

try {
  if (mode === 'reset') await transaction((c) => c.query(DROP));
  await ensureDatabase();
  console.log(mode === 'reset' ? 'Database wiped and demo data loaded.' : 'Database ready.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
