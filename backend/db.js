import pg from 'pg';
const { Pool } = pg;


const connectionString = process.env.DATABASE_URL;


export const pool = new Pool({
    connectionString,
// Heroku Postgres often requires SSL in production
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});


export async function initSchema() {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
}