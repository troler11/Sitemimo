import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet'; // <--- IMPORTANTE: Adicionado para segurança
import path from 'path';
import routes from './routes'; 

const app = express();

// 1. HELMET: Esconde a identidade do servidor e protege contra injeções
// Desativamos o contentSecurityPolicy temporariamente para não bloquear imagens externas do seu React
app.use(helmet({ contentSecurityPolicy: false }));

// 2. CORS RESTRITO: Só permite requisições do seu próprio domínio
const originPermitida = process.env.NODE_ENV === 'production' 
    ? 'https://mimo-mimopainel.3sbqz4.easypanel.host/' // Troque para sua URL de produção
    : '*'; // Permite tudo se estiver no localhost (desenvolvimento)

app.use(cors({
    origin: originPermitida,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. PROTEÇÃO DE PAYLOAD: Limita o tamanho do body da requisição (Evita ataques DOS)
app.use(express.json({ limit: '1mb' })); 

// 4. DELEGAÇÃO DE ROTAS: 
// Removi o app.post('/api/login') e o app.get('/api/dashboard') daqui.
// Como você já tem um `routes.ts`, TUDO de API deve ficar lá dentro para manter organizado.
app.use('/api', routes); 


// --- SERVINDO O FRONTEND (React / Webpack) ---
// Consolidei as chamadas de arquivos estáticos para usar apenas a pasta do build final
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});


// 5. TRATAMENTO DE ERRO GLOBAL (A Rede de Segurança)
// Se der algum erro fatal em qualquer lugar do código, ele cai aqui em vez de derrubar o Node.js
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('🚨 Erro Global:', err.message);
    res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT} e IP 0.0.0.0`);
});
