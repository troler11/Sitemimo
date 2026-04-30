import { Request, Response } from 'express';
import { fetchDashboardData } from '../services/DashboardService';
import crypto from 'crypto';
import { z } from 'zod';

// 1. SCHEMAS DE VALIDAÇÃO (ZOD)
// Garante que ninguém injete códigos estranhos ou arrays nos filtros
const querySchema = z.object({
    placa: z.string().max(10, "Placa muito longa").optional(),
    status: z.string().max(30).optional(),
    empresa: z.string().max(100).optional(),
    rota: z.string().max(100).optional(),
    sentido: z.enum(['ida', 'volta', 'IDA', 'VOLTA']).optional(),
    // Proteção contra exaustão de dados: paginação obrigatória com limite máximo
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(200).default(50) 
});

export const getFrotaExterna = async (req: Request, res: Response) => {
    try {
        // --- 2. SEGURANÇA MÁXIMA DA API KEY (Prevenção contra Timing Attacks) ---
        const apiKeyRecebida = req.headers['x-api-key'];
        const apiKeySecreta = process.env.API_EXTERNAL_SECRET; 

        if (!apiKeyRecebida || typeof apiKeyRecebida !== 'string' || !apiKeySecreta) {
            return res.status(401).json({ error: 'Acesso negado. API Key inválida ou ausente.' });
        }

        // Compara as chaves usando buffers (Tempo constante evita hackers de adivinharem a chave)
        const bufferRecebida = Buffer.from(apiKeyRecebida);
        const bufferSecreta = Buffer.from(apiKeySecreta);

        if (bufferRecebida.length !== bufferSecreta.length || !crypto.timingSafeEqual(bufferRecebida, bufferSecreta)) {
            return res.status(401).json({ error: 'Acesso negado. API Key incorreta.' });
        }

        // --- 3. SANITIZAÇÃO DE DADOS ---
        // O Zod limpa os parâmetros, converte textos para números (page/limit) e descarta o resto
        const filtros = querySchema.parse(req.query);

        // --- 4. BUSCA E FILTRAGEM ---
        const data = await fetchDashboardData(null);
        let resultado = data.todas_linhas || [];

        if (filtros.placa) {
            const p = filtros.placa.toUpperCase();
            resultado = resultado.filter(l => l.v && l.v.includes(p));
        }

        if (filtros.status) {
            const s = filtros.status.toUpperCase();
            resultado = resultado.filter(l => l.status_api === s);
        }

        if (filtros.empresa) {
            const e = filtros.empresa.toUpperCase();
            resultado = resultado.filter(l => l.e && l.e.toUpperCase().includes(e));
        }

        if (filtros.rota) {
            const r = filtros.rota.toUpperCase();
            resultado = resultado.filter(l => l.r && l.r.toUpperCase().includes(r));
        }
        
        if (filtros.sentido) {
            const s = filtros.sentido.toLowerCase();
            const valorSentido = s === 'ida' ? 1 : 0;
            resultado = resultado.filter(l => l.s === valorSentido);
        }

        // --- 5. PAGINAÇÃO E RESPOSTA SEGURA ---
        const totalRegistros = resultado.length;
        const totalPaginas = Math.ceil(totalRegistros / filtros.limit);
        
        // Pega apenas a fatia correspondente à página solicitada
        const inicio = (filtros.page - 1) * filtros.limit;
        const fim = inicio + filtros.limit;
        const dadosPaginados = resultado.slice(inicio, fim);

        return res.json({
            meta: {
                timestamp: new Date().toISOString(),
                total_registros: totalRegistros,
                pagina_atual: filtros.page,
                total_paginas: totalPaginas,
                registros_por_pagina: filtros.limit,
                filtros_aplicados: {
                    placa: filtros.placa,
                    status: filtros.status,
                    empresa: filtros.empresa,
                    rota: filtros.rota,
                    sentido: filtros.sentido
                }
            },
            dados: dadosPaginados
        });

    } catch (error) {
        // Intercepta erros de formatação na URL (Zod)
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Parâmetros de busca inválidos.", detalhes: error.errors });
        }
        
        console.error("🚨 Erro API Externa:", error);
        return res.status(500).json({ error: 'Erro interno ao processar dados da frota.' });
    }
};
