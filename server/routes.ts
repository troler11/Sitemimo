import { Router } from 'express';
import { login } from './controllers/authController';
import { getDashboardData } from './controllers/dashboardController';
import { verifyToken } from './middleware/auth';

const router = Router();

// Rota Pública
router.post('/login', login);

// Rotas Protegidas
router.get('/dashboard', verifyToken, getDashboardData);
// router.get('/admin/users', verifyToken, getUsers); // Implementar depois
// router.post('/admin/users', verifyToken, createUser); // Implementar depois

export default router;
