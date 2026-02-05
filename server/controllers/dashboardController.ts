import { Request, Response } from 'express';
import { fetchDashboardData } from '../services/DashboardService';

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user; 
        const isAdmin = user.role === 'admin';
        // Se for admin, passa null (todas), senão passa o array de empresas
        const allowed = isAdmin ? null : (user.allowed_companies || []);

        const data = await fetchDashboardData(allowed);
        
        return res.json(data);
    } catch (error) {
        return res.status(500).json({ error: "Erro interno no dashboard" });
    }
};
