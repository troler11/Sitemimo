import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// 1. CARREGAMENTO SEGURO DE VARIÁVEIS
// Em produção (Docker/Easypanel), as variáveis são injetadas pelo próprio ambiente.
// Arquivos .env físicos só devem ser lidos em ambiente de desenvolvimento.
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
    dotenv.config();
}

// 2. CONFIGURAÇÃO BASEADA NA STRING DE CONEXÃO
const poolConfig: PoolConfig = {
    // Dá preferência absoluta para a URL completa (mais seguro e menos propício a erros de parse)
    connectionString: process.env.DATABASE_URL,

    // 3. PROTEÇÃO CONTRA EXAUSTÃO DE CONEXÕES (Prevenção de indisponibilidade)
    max: 20, // Limite máximo de clientes conectados simultaneamente
    idleTimeoutMillis: 30000, // Derruba conexões inativas após 30 segundos
    connectionTimeoutMillis: 5000, // Cancela a tentativa de conexão se demorar mais de 5s
};

// 4. FALLBACK CASO A URL NÃO EXISTA
if (!process.env.DATABASE_URL) {
    poolConfig.host = process.env.DB_HOST;
    poolConfig.database = process.env.DB_NAME;
    poolConfig.user = process.env.DB_USER;
    poolConfig.password = process.env.DB_PASSWORD;
    poolConfig.port = parseInt(process.env.DB_PORT || '5432');
}

// 5. BLINDAGEM SSL
if (process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { 
        // ATENÇÃO: rejectUnauthorized: false permite ataques "Man-in-the-Middle".
        // Para proteção máxima, isso deve ser true.
        rejectUnauthorized: true 
    };
} else {
    // Em localhost, muitas vezes não temos SSL
    poolConfig.ssl = false; 
}

export const pool = new Pool(poolConfig);

// Ouve erros inesperados no pool para evitar que o servidor caia silenciosamente
pool.on('error', (err) => {
    console.error('🚨 Erro crítico na conexão com o banco de dados:', err.message);
    process.exit(-1);
});
