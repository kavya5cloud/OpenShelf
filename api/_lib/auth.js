import crypto from 'node:crypto';

// Stateless session token: base64url(JSON payload) + '.' + HMAC-SHA256 signature.
const DAYS = 7;

// AUTH_SECRET is optional: without it, the secret is derived from the
// database URL, which is already private to the server.
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const db = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'openshelf-local-dev';
  return crypto.createHash('sha256').update('openshelf-auth:' + db).digest('hex');
}
const mac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function signToken({ sub, role }) {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Date.now() + DAYS * 864e5 })).toString('base64url');
  return body + '.' + mac(body);
}

export function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (e) {
    return null;
  }
}
