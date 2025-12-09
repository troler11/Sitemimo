import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Configurações do Supabase
export const pool = new Pool({
    host: process.env.DB_HOST, // 'aws-1-us-east-1.pooler.supabase.com'
    database: process.env.DB_NAME, // 'postgres'
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '6543'),
    ssl: { rejectUnauthorized: false } // Necessário para Supabase/Azure
});
