import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import routes from './routes'; 

const app = express();

// 1. HELMET: Esconde a identidade do servidor e protege contra injeções
app.use(helmet({ contentSecurityPolicy: false }));

// 2. CORS RESTRITO
const originPermitida = process.env.NODE_ENV === 'production' 
    ? 'https://mimo-mimopainel.3sbqz4.easypanel.host' 
    : '*'; 

app.use(cors({
    origin: originPermitida,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. PROTEÇÃO DE PAYLOAD
app.use(express.json({ limit: '1mb' })); 

// 4. DELEGAÇÃO DE ROTAS API
app.use('/api', routes); 


// --- SERVINDO O FRONTEND (Conforme seu código original que funcionava) ---

// Serve os arquivos estáticos da pasta client
app.use(express.static(path.join(__dirname, '../client')));

// Serve os arquivos do Webpack/Build em produção
app.use(express.static(path.join(__dirname, '../client/dist')));

// O curinga (*) que entrega o index.html DEVE ficar por último
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});


// 5. TRATAMENTO DE ERRO GLOBAL
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('🚨 Erro Global:', err.message);
    res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT} e IP 0.0.0.0`);
});
