import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import routes from './routes'; 

const app = express();

// 1. HELMET: Esconde a identidade do servidor e protege contra injeções
app.use(helmet({ contentSecurityPolicy: false }));

// 2. CORS RESTRITO: Só permite requisições do seu próprio domínio
const originPermitida = process.env.NODE_ENV === 'production' 
    ? 'https://mimo-mimopainel.3sbqz4.easypanel.host' // <-- CORREÇÃO: Sem a barra (/) no final
    : '*'; // Permite tudo se estiver no localhost (desenvolvimento)

app.use(cors({
    origin: originPermitida,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. PROTEÇÃO DE PAYLOAD: Limita o tamanho do body da requisição (Evita ataques DOS)
app.use(express.json({ limit: '1mb' })); 

// 4. DELEGAÇÃO DE ROTAS: 
app.use('/api', routes); 


// --- SERVINDO O FRONTEND (React / Webpack) ---
// CORREÇÃO: Usando process.cwd() no lugar de __dirname para evitar o erro ENOENT
const clientBuildPath = path.join(process.cwd(), 'client/dist');

app.use(express.static(clientBuildPath));

app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});


// 5. TRATAMENTO DE ERRO GLOBAL (A Rede de Segurança)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('🚨 Erro Global:', err.message);
    res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT} e IP 0.0.0.0`);
});
