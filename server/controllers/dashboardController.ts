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

        // 2. SANITIZAÇÃO DE DADOS (Prevenção contra injeção ou dados corrompidos)
        if (!isAdmin) {
            // Garante 100% que seja um Array, ignorando se vier como string mal formatada, objeto ou nulo do banco
            const rawCompanies = Array.isArray(user.allowed_companies) ? user.allowed_companies : [];
            
            // Filtra o array para garantir que só existam números (ajuste para 'string' se seus IDs forem UUID/Texto)
            // Isso impede que um JWT adulterado passe um comando SQL malicioso no array
            allowed = rawCompanies.filter(item => typeof item === 'number' && !isNaN(item));

            // Bloqueio Pró-ativo: Se o usuário não é admin e não tem empresas, não precisamos nem bater no banco!
            if (allowed.length === 0) {
                return res.json({ 
                    message: "Nenhuma empresa vinculada ao seu perfil.", 
                    data: [] // Retorna uma estrutura vazia segura para o front-end não quebrar
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
