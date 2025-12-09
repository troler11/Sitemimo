import express from 'express';
import cors from 'cors';
import routes from './routes'; // Importa o arquivo acima
import { getDashboardData } from './controllers/dashboardController';
import { verifyToken } from './middleware/auth';
import { login } from './controllers/authController'; // Você precisa criar este baseado no login.php
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// Rotas Publicas
app.post('/api/login', login);

app.use('/api', routes); // Prefixo /api para tudo
// Serve os arquivos estáticos do React (JS, CSS)
app.use(express.static(path.join(__dirname, '../client')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Rotas Protegidas
app.get('/api/dashboard', verifyToken, getDashboardData);

// Servir o Frontend (Webpack Build) em produção
app.use(express.static('../client/dist'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
