import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const escalaCache = new NodeCache({ stdTTL: 60 });
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpJjRQ0KhIQtHA36CD_cugZyQD1GrftfIahwqxV9Nqxx1jnF5T2bt0tQgNM0kWfRArrQ/exec';

// --- FUNÇÃO DE PROCESSAMENTO (PORTADA DO PHP) ---
const processarDados = (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length < 2) return [];

    // 1. Normaliza Cabeçalho
    const header = rows[0].map((col: string) => String(col).trim().toLowerCase());

    // 2. Helper para achar colunas dinamicamente
    const findCol = (keywords: string[]) => {
        for (let i = 0; i < header.length; i++) {
            for (const key of keywords) {
                if (header[i].includes(key)) return i;
            }
        }
        return -1;
    };

    // 3. Mapeamento (Igual ao PHP)
    const map = {
        empresa: findCol(['clientes', 'cliente', 'empresa', 'clientes']),
        rota: findCol(['rota', 'linha', 'itinerario']),
        motorista: findCol(['motorista', 'condutor', 'mot']),
        reserva: findCol(['reserva']),
        escala: findCol(['escala', 'veiculo escala']),
        enviada: findCol(['enviada', 'veiculo enviado']),
        prog: findCol(['ini', 'inicio', 'prog']),
        real: findCol(['real', 'realizado', 'chegada']),
        obs: findCol(['observação', 'obs', 'ocorrencia','OBSERVAÇÕES']),
        manut: findCol(['manutenção', 'manut', 'OBSERVAÇÕES',]),
        carro: findCol(['aguardando', 'carro','OBSERVAÇÕES']),
        ra: findCol(['ra', 'r.a', 'registro'])
    };

    const dadosProcessados: any[] = [];
    const limparHorario = (val: any) => (!val ? '' : String(val).trim().substring(0, 5));

    // 4. Loop de Processamento
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        
        // Pula linhas vazias
        if (!r[map.empresa] && !r[map.rota]) continue;

        const empresa = r[map.empresa] ? String(r[map.empresa]).trim() : '---';
        const rota = r[map.rota] ? String(r[map.rota]).trim() : '---';

        // Lógica de Bloqueio (Termos Proibidos)
        const empresaLimpa = empresa.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const termosBloqueados = ['VIACAO MIMO VARZEA', 'VIACAO MIMO', 'GARAGEM'];
        if (termosBloqueados.some(termo => empresaLimpa.includes(termo))) continue;

        const valManut = r[map.manut] ? String(r[map.manut]).toLowerCase() : '';
        const valCarro = r[map.carro] ? String(r[map.carro]).toLowerCase() : '';

        dadosProcessados.push({
            empresa,
            rota,
            motorista: r[map.motorista] || 'Não Definido',
            reserva: r[map.reserva] || '',
            frota_escala: r[map.escala] || '---',
            frota_enviada: r[map.enviada] || '---',
            h_prog: limparHorario(r[map.prog]),
            h_real: limparHorario(r[map.real]),
            obs: r[map.obs] || '',
            ra_val: r[map.ra] || '',
            manutencao: (valManut.includes('sim') || valManut.includes('manuten')),
            aguardando: (valCarro.includes('sim') || valCarro.includes('aguard')),
        });
    }

    // Ordenação Padrão (Por Horário)
    return dadosProcessados.sort((a, b) => {
        if (a.h_prog === b.h_prog) return 0;
        return a.h_prog < b.h_prog ? -1 : 1;
    });
};

export const getEscala = async (req: Request, res: Response) => {
    const dataFiltro = req.query.data as string || new Date().toLocaleDateString('pt-BR');
    const cacheKey = `escala_v2_${dataFiltro}`;

    const cached = escalaCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(GOOGLE_SCRIPT_URL, {
            params: { action: 'read', data: dataFiltro },
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });

        // Processa os dados brutos aqui no servidor
        const dadosLimpos = processarDados(response.data);

        escalaCache.set(cacheKey, dadosLimpos);
        return res.json(dadosLimpos);

    } catch (error) {
        console.error("Erro Escala:", error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};
