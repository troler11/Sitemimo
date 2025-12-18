import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Garante que lê o .env certo
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Backup caso esteja na mesma pasta
dotenv.config();

console.log("Conectando no Supabase:", process.env.DB_HOST);

export const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),

    // AQUI ESTÁ O SEGREDO DO SUPABASE:
    ssl: { rejectUnauthorized: false }
});
