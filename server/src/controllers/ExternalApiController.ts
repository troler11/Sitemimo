import { Request, Response } from 'express';
import { fetchDashboardData, LinhaOutput } from '../services/DashboardService';

export const getFrotaExterna = async (req: Request, res: Response) => {
    try {
        // --- 1. SEGURANÇA (API KEY) ---
        // O cliente deve enviar um header 'x-api-key'
        const apiKeyRecebida = req.headers['x-api-key'];
        const apiKeySecreta = process.env.API_EXTERNAL_SECRET; // Defina isso no seu .env

        if (!apiKeySecreta || apiKeyRecebida !== apiKeySecreta) {
            return res.status(403).json({ 
                error: 'Acesso negado', 
                message: 'API Key inválida ou ausente.' 
            });
        }

        // --- 2. BUSCA DADOS ---
        // Passamos null para buscar todas as empresas. 
        // (Se quiser restringir por API Key, você pode criar uma lógica aqui)
        const data = await fetchDashboardData(null);
        let resultado = data.todas_linhas;

        // --- 3. FILTROS (QUERY PARAMS) ---
        // Exemplo: ?status=ATRASADO&empresa=MIMO
        const { placa, status, empresa, rota, sentido } = req.query;

        if (placa) {
            const p = String(placa).toUpperCase();
            resultado = resultado.filter(l => l.v.includes(p));
        }

        if (status) {
            const s = String(status).toUpperCase();
            // Filtra pelo status calculado no backend
            resultado = resultado.filter(l => l.status_api === s);
        }

        if (empresa) {
            const e = String(empresa).toUpperCase();
            resultado = resultado.filter(l => l.e.toUpperCase().includes(e));
        }

        if (rota) {
            const r = String(rota).toUpperCase();
            resultado = resultado.filter(l => l.r.toUpperCase().includes(r));
        }
        
        if (sentido) {
            // ?sentido=ida ou ?sentido=volta
            const s = String(sentido).toLowerCase();
            const valorSentido = s === 'ida' ? 1 : 0;
            resultado = resultado.filter(l => l.s === valorSentido);
        }

        // --- 4. RESPOSTA ---
        return res.json({
            meta: {
                timestamp: new Date().toISOString(),
                total_registros: resultado.length,
                filtros_aplicados: req.query
            },
            dados: resultado
        });

    } catch (error) {
        console.error("Erro API Externa:", error);
        return res.status(500).json({ error: 'Erro interno ao processar dados da frota.' });
    }
};
