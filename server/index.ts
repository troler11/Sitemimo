import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes'; // Seu arquivo de rotas consolidado

const app = express();

// --- 1. Configurações Globais ---
app.use(cors());
app.use(express.json());

// --- 2. Rotas da API (A PRIORIDADE MÁXIMA) ---
// Isso garante que qualquer requisição começando com /api seja tratada pelo backend.
// Se o seu routes.ts tem 'router.post("/login")', aqui virará "/api/login".
app.use('/api', routes);

// ⚠️ AJUSTE IMPORTANTE NA ROTA EXTERNA:
// Como montamos o routes com o prefixo '/api', verifique no seu arquivo 'routes.ts':
// Se lá estiver: router.get('/api/v1/...'), o resultado final será /api/api/v1/... (duplicado).
// O ideal no routes.ts é deixar: router.get('/v1/monitoramento/frota', ...).

// --- 3. Arquivos Estáticos (Frontend) ---
// Define onde está o build de produção do React (geralmente 'dist' ou 'build')
// __dirname sobe um nível (..) e entra em client/dist
const buildPath = path.join(__dirname, '../client/dist');
app.use(express.static(buildPath));

// --- 4. Fallback do React (SPA) - "Pega tudo que sobrou" ---
// Se a requisição não foi atendida pelas rotas /api e não é um arquivo estático (js/css),
// então devolve o index.html para o React gerenciar a rota via React Router.
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

// --- 5. Inicialização do Servidor ---
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`📂 Servindo frontend de: ${buildPath}`);
});
