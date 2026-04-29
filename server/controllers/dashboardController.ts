import { Request, Response } from 'express';
import { fetchDashboardData } from '../src/services/DashboardService';

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user; 

        // 1. DEFESA EM PROFUNDIDADE (Verificação Estrita)
        // Mesmo com o middleware verifyToken, garantimos que o 'user' realmente chegou aqui.
        if (!user) {
            return res.status(401).json({ error: "Sessão inválida ou não encontrada." });
        }

        const isAdmin = user.role === 'admin';
        let allowed = null;

       // 2. SANITIZAÇÃO DE DADOS 
        if (!isAdmin) {
            const rawCompanies: any[] = Array.isArray(user.allowed_companies) ? user.allowed_companies : [];
            
            allowed = rawCompanies
                .map((item: any) => Number(item)) // 1. Tenta transformar tudo em número
                .filter((item: any) => !isNaN(item) && item > 0) // 2. Joga fora o que for lixo ou texto malicioso
                .map((item: any) => String(item)); // <--- 3. CORREÇÃO: Transforma os números limpos DE VOLTA em texto!

            if (allowed.length === 0) {
                return res.json({ 
                    message: "Nenhuma empresa vinculada ao seu perfil.", 
                    data: [] 
                });
            }
        }

        // 3. BUSCA DOS DADOS
        const data = await fetchDashboardData(allowed);
        return res.json(data);

    } catch (error) {
        // 4. LOG DE ERRO SEGURO
        // Registra o erro no servidor para você depurar, mas NUNCA envia os detalhes técnicos para o Front-end
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[Dashboard Error - User ID: ${(req as any).user?.id || 'Desconhecido'}]:`, errorMessage);
        
        return res.status(500).json({ error: "Não foi possível carregar os dados do dashboard no momento." });
    }
};
