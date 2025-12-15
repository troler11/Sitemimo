import { Router } from 'express';
import { login } from './controllers/authController';
import { getDashboardData } from './controllers/dashboardController';
import { calculateRoute } from './controllers/mapController'; // <--- Importe
import { getUsers, createUser, updateUser, deleteUser } from './controllers/userController';
import { getEscala } from './controllers/escalaController';
import { verifyToken } from './middleware/auth';
import { createRota, getRotas } from './controllers/rotaController';

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

//Criar Rotas
router.post('/rotas', createRota);
router.get('/rotas', getRotas);

export default router;
