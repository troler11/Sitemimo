import { Router } from 'express';
import { login } from './controllers/authController';
import { getDashboardData } from './controllers/dashboardController';
import { calculateRoute } from './controllers/mapController';
import { getUsers, createUser, updateUser, deleteUser } from './controllers/userController';
import { getEscala, atualizarEscala, getMotoristas } from './controllers/escalaController';
import { verifyToken, authorizeRole } from './middleware/auth';
import { getFrotaExterna } from './src/controllers/ExternalApiController';
import { createRota, getRotas, getRotaById, updateRota, deleteRota } from './controllers/rotaController';
import { cadastrarMotorista } from './controllers/motoristaController';

const router = Router();

// --- ROTAS PÚBLICAS ---
// O Login precisa ser público para que o usuário consiga o token inicial
router.post('/login', login);

// --- ROTAS PROTEGIDAS (Exigem Token no Insomnia) ---

// Dashboard & Mapa
router.get('/dashboard', verifyToken, getDashboardData);
router.get('/rota/:tipo/:placa', verifyToken, calculateRoute);

// Admin (Usuários)

router.get('/users', verifyToken, authorizeRole('admin'), getUsers);
router.post('/users', verifyToken, authorizeRole('admin'), createUser);
router.delete('/users/:id', verifyToken, authorizeRole('admin'), deleteUser);
router.put('/users/:id', verifyToken, authorizeRole('admin'), updateUser);

// Escala (Adicionei verifyToken nas que faltavam)
router.get('/escala', verifyToken, getEscala);
router.put('/escala/atualizar', verifyToken, atualizarEscala); // Protegido!
router.get('/motoristas', verifyToken, getMotoristas);        // Protegido!

// Rota para integração externa
router.get('/v1/monitoramento/frota', verifyToken, getFrotaExterna); // Protegido!

// Operações de Rotas (Protegi todas)
router.post('/rotas', verifyToken, createRota);
router.get('/rotas', verifyToken, getRotas);
router.get('/rotas/:id', verifyToken, getRotaById);
router.put('/rotas/:id', verifyToken, updateRota);
router.delete('/rotas/:id', verifyToken, deleteRota);

// Cadastro motorista
router.post('/motorista', verifyToken, cadastrarMotorista);

export default router;
