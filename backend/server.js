import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { pool, initSchema } from './db.js';
import { generateKeyPairSync } from 'crypto';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json());

// CORS — allow your static frontends
const allowed = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)), credentials: false }));


// ===== Auth token (HS256) =====
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

// ===== QR token (RS256) =====
let PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
if (!PRIVATE_KEY || !PUBLIC_KEY) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    PRIVATE_KEY = privateKey;
    PUBLIC_KEY = publicKey;
    console.warn('[WARN] Using ephemeral RSA keys; set JWT_PRIVATE_KEY/JWT_PUBLIC_KEY in production');
}

const TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // ±5 minutes

// ===== Utils =====
function signAuthToken(user) {
    return jwt.sign({ sub: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS, algorithm: 'HS256' });
}
function signQrToken(username, ttlSec = 7 * 24 * 60 * 60) {
    return jwt.sign({ sub: username, typ: 'QR' }, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: ttlSec });
}


function auth(requiredRoles = []) {
    return async (req, res, next) => {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Missing token' });
        try {
            const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
            if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.user = payload; // sub, role, username
        next();
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
    };
}

function requireTimestamp(req, res, next) {
    const ts = req.headers['x-request-timestamp'];
    if (!ts) return res.status(400).json({ error: 'Missing X-Request-Timestamp' });
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return res.status(400).json({ error: 'Bad timestamp' });
    if (Math.abs(Date.now() - t) > TIMESTAMP_SKEW_MS) return res.status(400).json({ error: 'Stale/early request' });
    next();
}

const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60 }); // 60 writes/min per IP

// ===== Validation =====
const credSchema = Joi.object({ username: Joi.string().min(3).max(50).required(), password: Joi.string().min(6).max(200).required() });
const changeSchema = Joi.object({
    amount: Joi.number().integer().valid(10,20,30).required(),
    userToken: Joi.string().optional(),
    targetUsername: Joi.string().optional()
}).xor('userToken','targetUsername');

// ===== Health =====
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ===== Auth =====
app.post('/api/register', async (req, res) => {
    const { error, value } = credSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { username, password } = value;
    const hash = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query('insert into users(username, password_hash, role, credits) values($1,$2,$3,$4) returning id, username, role, credits', [username, hash, 'USER', 0]);
        const user = result.rows[0];
        const token = signAuthToken(user);
        res.json({ success: true, token, user });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'Username taken' });
        console.error(e); return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { error, value } = credSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { username, password } = value;
    const result = await pool.query('select id, username, password_hash, role, credits from users where username=$1', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    delete user.password_hash;
    const token = signAuthToken(user);
    res.json({ success: true, token, user });
});

app.get('/api/me', auth(), async (req, res) => {
    const r = await pool.query('select id, username, role, credits from users where id=$1', [req.user.sub]);
    res.json(r.rows[0]);
});

// ===== QR token issuance =====
app.get('/api/qr', auth(['USER']), (req, res) => {
    const token = signQrToken(req.user.username);
    const { exp } = jwt.decode(token);
    res.json({ token, exp });
});

// ===== Helpers =====
async function getTargetByTokenOrUsername(client, { userToken, targetUsername }) {
    let username = targetUsername;
    if (userToken) {
        try {
            const payload = jwt.verify(userToken, PUBLIC_KEY, { algorithms: ['RS256'] });
            if (payload.typ !== 'QR') throw new Error('Bad QR token');
            username = payload.sub;
        } catch (e) { throw new Error('Invalid QR token'); }
        }
    const target = await client.query('select id, credits from users where username=$1 for update', [username]);
    if (!target.rowCount) throw new Error('Target not found');
    return target.rows[0];
}

function readIdempotencyKey(req) {
    const key = req.headers['idempotency-key'];
    if (!key) throw new Error('Missing Idempotency-Key header');
    return key;
}

// ===== Kiosk add =====
app.post('/api/credits/add', auth(['KIOSK','ADMIN']), writeLimiter, requireTimestamp, async (req, res) => {
    const { error, value } = changeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const idempotencyKey = (()=>{ try { return readIdempotencyKey(req);} catch(e){ return null; }})();
    if (!idempotencyKey) return res.status(400).json({ error: 'Missing Idempotency-Key header' });


const client = await pool.connect();
try {
    await client.query('BEGIN');
    const dup = await client.query('select id from requests where id=$1', [idempotencyKey]);
    if (dup.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Duplicate request' }); }


    const target = await getTargetByTokenOrUsername(client, value);
    const updated = await client.query('update users set credits = credits + $1 where id=$2 returning credits', [value.amount, target.id]);
    await client.query('insert into requests(id, actor_user_id, target_user_id, amount, kind) values($1,$2,$3,$4,$5)', [idempotencyKey, req.user.sub, target.id, value.amount, 'ADD']);
    await client.query('COMMIT');
    res.json({ success: true, credits: updated.rows[0].credits });
} catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
} finally { client.release(); }
});

// ===== Merchant deduct (never negative) =====
app.post('/api/credits/deduct', auth(['MERCHANT','ADMIN']), writeLimiter, requireTimestamp, async (req, res) => {
    const { error, value } = changeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const idempotencyKey = (()=>{ try { return readIdempotencyKey(req);} catch(e){ return null; }})();
    if (!idempotencyKey) return res.status(400).json({ error: 'Missing Idempotency-Key header' });


    const client = await pool.connect();
    try {
    await client.query('BEGIN');
    const dup = await client.query('select id from requests where id=$1', [idempotencyKey]);
    if (dup.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Duplicate request' }); }


    const target = await getTargetByTokenOrUsername(client, value);
    const current = target.credits;
    if (current < value.amount) throw new Error('Insufficient credits');
    const updated = await client.query('update users set credits = credits - $1 where id=$2 returning credits', [value.amount, target.id]);
    await client.query('insert into requests(id, actor_user_id, target_user_id, amount, kind) values($1,$2,$3,$4,$5)', [idempotencyKey, req.user.sub, target.id, value.amount, 'DEDUCT']);
    await client.query('COMMIT');
    res.json({ success: true, credits: updated.rows[0].credits });
} catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
} finally { client.release(); }
});

// Demo big button (USER) — no-op write
app.post('/api/big-button', auth(['USER']), requireTimestamp, async (req, res) => {
    res.json({ success: true, at: new Date().toISOString() });
});

// Init schema (local dev)
if (process.argv.includes('--init')) {
    initSchema()
        .then(() => console.log('Schema initialized'))
        .catch(err => { console.error(err); process.exit(1); })
        .finally(() => process.exit(0));
}

const port = process.env.PORT || 3000;
app.listen(port, async () => {
    try { await initSchema(); } catch (e) { console.error('Schema init error', e); }
    console.log(`API listening on :${port}`);
});