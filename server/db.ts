import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Garante que lê o .env certo
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Backup caso esteja na mesma pasta
dotenv.config();

console.log("Conectando no Supabase:", process.env.DB_HOST);

export const pool = new Pool({
    // Opção A: Se existir a string completa (padrão do Easypanel/Supabase), usa ela
    connectionString: process.env.DATABASE_URL ? process.env.DATABASE_URL : undefined,

    // Opção B: Se não, tenta montar com as partes (fallback)
    host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
    database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME,
    user: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
    password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
    port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),

    ssl: { rejectUnauthorized: false }
});
