import express from 'express';
import cors from 'cors';
import { getDashboardData } from './controllers/dashboardController';
import { verifyToken } from './middleware/auth';
import { login } from './controllers/authController'; // Você precisa criar este baseado no login.php

const app = express();
app.use(cors());
app.use(express.json());

// Rotas Publicas
app.post('/api/login', login);

// Rotas Protegidas
app.get('/api/dashboard', verifyToken, getDashboardData);

// Servir o Frontend (Webpack Build) em produção
app.use(express.static('../client/dist'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
