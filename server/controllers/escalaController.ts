import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const escalaCache = new NodeCache({ stdTTL: 60 }); // Cache 60s
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpJjRQ0KhIQtHA36CD_cugZyQD1GrftfIahwqxV9Nqxx1jnF5T2bt0tQgNM0kWfRArrQ/exec';

export const getEscala = async (req: Request, res: Response) => {
    const dataFiltro = req.query.data as string || new Date().toLocaleDateString('pt-BR');
    const cacheKey = `escala_${dataFiltro}`;

    // 1. Tenta Cache
    const cached = escalaCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        // 2. Chama Google Script (Seguindo seu PHP: action=read&data=...)
        const response = await axios.get(GOOGLE_SCRIPT_URL, {
            params: { action: 'read', data: dataFiltro },
            headers: { 'User-Agent': 'Mozilla/5.0' }, // Google as vezes bloqueia sem UA
            timeout: 15000
        });

        // 3. Processamento de Dados (Traduzindo sua lógica PHP "processarDados")
        // No PHP você mapeava colunas. Aqui assumimos que o Google já retorna JSON.
        // Se retornar array de arrays, precisaria do mapeador aqui.
        // Assumindo que o Google Script já retorna JSON limpo ou array de arrays:
        
        let dadosLimpos = response.data; // Adapte aqui se precisar da lógica de map do PHP

        if (dadosLimpos && !dadosLimpos.error) {
            escalaCache.set(cacheKey, dadosLimpos);
            return res.json(dadosLimpos);
        }
        
        return res.json([]);

    } catch (error) {
        console.error("Erro Escala Google:", error);
        return res.status(500).json({ error: "Erro ao buscar escala externa" });
    }
};
