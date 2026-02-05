import { Router } from 'express';
import { login } from './controllers/authController';
import { getDashboardData } from './controllers/dashboardController';
import { calculateRoute } from './controllers/mapController'; // <--- Importe
import { getUsers, createUser, updateUser, deleteUser } from './controllers/userController';
import { getEscala } from './controllers/escalaController';
import { verifyToken } from './middleware/auth';
import { getFrotaExterna } from './src/controllers/ExternalApiController';
import {createRota, getRotas, getRotaById, updateRota, deleteRota} from './controllers/rotaController';

const router = Router();

// Rota Pública
router.post('/login', login);

// Dashboard & Mapa
router.get('/dashboard', verifyToken, getDashboardData);
router.get('/rota/:tipo/:placa', verifyToken, calculateRoute);

// Admin (Usuários)
router.get('/users', verifyToken, getUsers);
router.post('/users', verifyToken, createUser);
router.put('/users/:id', verifyToken, updateUser);
router.delete('/users/:id', verifyToken, deleteUser);


// Escala
router.get('/escala', verifyToken, getEscala);

// Rota para integração externa
router.get('/api/v1/monitoramento/frota', getFrotaExterna);

//Criar Rotas
router.post('/rotas', createRota);
router.get('/rotas', getRotas);

// 2. Operações por ID (Necessário para a Edição funcionar)
router.get('/rotas/:id', getRotaById); // <--- Busca os dados para preencher o formulário
router.put('/rotas/:id', updateRota);  // <--- Salva as alterações do formulário
router.delete('/rotas/:id', deleteRota); // <--- NOVA ROTA

export default router;
