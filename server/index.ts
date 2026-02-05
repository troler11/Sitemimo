import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes'; 

const app = express();

// --- 1. Configurações Globais ---
app.use(cors());
app.use(express.json());

// --- 2. Rotas da API ---
app.use('/api', routes);

// --- 3. Arquivos Estáticos (Frontend) ---
// Usamos process.cwd() para garantir que partimos da raiz do projeto (/app)
// Isso evita erros dependendo de onde o arquivo JS compilado está (dist/server/...)
const buildPath = path.join(process.cwd(), 'client', 'dist');

// Middleware para servir arquivos estáticos (JS, CSS, Imagens)
app.use(express.static(buildPath));

// --- 4. Fallback do React (SPA) ---
// Se não for uma rota de API ou um arquivo estático, o React assume
app.get('*', (req, res) => {
    const indexPath = path.join(buildPath, 'index.html');
    
    // Verificação de segurança: se o arquivo não existir, avisa no log
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error(`❌ Erro ao enviar index.html: ${indexPath}`);
            res.status(404).send("Erro: Frontend não encontrado. Certifique-se de que o build foi gerado.");
        }
    });
});

// --- 5. Inicialização do Servidor ---
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🔍 Procurando frontend em: ${buildPath}`);
});
