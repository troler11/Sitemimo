import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import { google } from 'googleapis'; 
// 👇 Importa as credenciais diretamente do seu novo arquivo TS
import { credenciais } from './googleCreds'; 

const escalaCache = new NodeCache({ stdTTL: 60 });
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyt3rsW4VTNgBeTnop4_whvzGZ39eSkCHpKU2vldxVuN2HG6nw2bPRq7fcJqpJfwV8/exec';

// ==========================================
// CONFIGURAÇÕES GERAIS E AUTENTICAÇÃO
// ==========================================
const SPREADSHEET_ID = '1xljTWv2Gyvvh3mUkVS4ibfLcxOMr6iXXy4RBn6c0H0M'; 

// Autenticação Pura: Sem replace, sem hacks! O TS resolve sozinho.
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: credenciais.client_email,
        private_key: credenciais.private_key, 
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

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

    // 3. Mapeamento
    const map = {
        empresa: findCol(['clientes', 'cliente', 'empresa', 'clientes']),
        rota: findCol(['rota', 'linha', 'itinerario']),
        motorista: findCol(['motorista', 'condutor', 'mot']),
        reserva: findCol(['reserva']),
        escala: findCol(['escala', 'veiculo escala']),
        enviada: findCol(['enviada', 'veiculo enviado']),
        prog: findCol(['ini', 'inicio', 'prog']),
        real: findCol(['real', 'realizado', 'chegada']),
        obs: findCol(['observação', 'obs', 'ocorrencia','observações']),
        manut: findCol(['manutenção', 'manut', 'observações', 'observação']),
        carro: findCol(['aguardando', 'carro','observações', 'observação']),
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

// ==========================================
// ROTA GET: BUSCAR LISTA DE MOTORISTAS (MODO DEBUG)
// ==========================================
export const getMotoristas = async (req: Request, res: Response): Promise<Response> => {
    // DESATIVAMOS O CACHE TEMPORARIAMENTE PARA TESTES
    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client as any });

        console.log("🕵️ Buscando a aba 'BASE CONSULTA MOTORISTAS' no Google Sheets...");

        // Mudamos de A:A para A:Z temporariamente para ver se os dados estão em outra coluna
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "'BASE CONSULTA MOTORISTAS'!A:Z", 
        });

        const rows = response.data.values;
        
        if (!rows || rows.length === 0) {
            console.log("❌ O Google respondeu, mas disse que a aba não existe ou está 100% vazia.");
            return res.json([]);
        }

        console.log(`✅ O Google encontrou ${rows.length} linhas!`);
        console.log("👀 Amostra da Linha 1 (Cabeçalho):", rows[0]);
        console.log("👀 Amostra da Linha 2 (Primeiro dado):", rows[1] || "Vazia");

        // Assumindo que os nomes estão na Coluna A (Índice 0). 
        // Se no log acima o nome aparecer na posição 1, mude row[0] para row[1]
        const motoristas = rows
            .map(row => row[0] ? String(row[0]).trim() : '')
            .filter(nome => nome !== '' && nome.toLowerCase() !== 'motorista' && nome.toLowerCase() !== 'nome');

        const motoristasUnicos = [...new Set(motoristas)].sort();

        console.log(`🚗 Total de motoristas únicos extraídos: ${motoristasUnicos.length}`);

        return res.json(motoristasUnicos);
    } catch (error) {
        console.error("🚨 Erro fatal ao buscar motoristas no Sheets:", error);
        return res.status(500).json({ error: 'Erro ao buscar a lista de motoristas.' });
    }
};
// ==========================================
// ROTA GET: BUSCAR DADOS DA ESCALA
// ==========================================
export const getEscala = async (req: Request, res: Response) => {
    const dataFiltro = req.query.data as string; 
    
    if (!dataFiltro) {
        return res.status(400).json({ error: "Data não informada pelo frontend" });
    }

    const cacheKey = `escala_v2_${dataFiltro}`;

    const cached = escalaCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const response = await axios.get(GOOGLE_SCRIPT_URL, {
            params: { action: 'read', data: dataFiltro },
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });

        const dadosLimpos = processarDados(response.data);

        escalaCache.set(cacheKey, dadosLimpos);
        return res.json(dadosLimpos);

    } catch (error) {
        console.error("Erro Escala:", error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};

// ==========================================
// ROTA PUT: ATUALIZAR DADOS
// ==========================================
export const atualizarEscala = async (req: Request, res: Response) => {
    const { data_escala, empresa, rota, h_prog, novo_motorista, nova_frota } = req.body;

    if (!data_escala) {
        return res.status(400).json({ error: "Data não informada para atualização" });
    }

    // 🔥 O nome da aba passa a ser a própria data!
    const SHEET_NAME = data_escala; 

    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client as any });

        // Puxamos a planilha toda para achar a linha correta
        // Note as aspas simples ('') em volta de ${SHEET_NAME} por causa das barras da data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${SHEET_NAME}'!A:Z`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: `Aba ${SHEET_NAME} não encontrada ou vazia.` });
        }

        let rowIndex = -1;

        // ATENÇÃO: Verifique as colunas exatas da sua planilha
        const INDICE_DATA = 12;      // Ex: Coluna M = 12
        const INDICE_EMPRESA = 0;    // Ex: Coluna A = 0
        const INDICE_ROTA = 1;       // Ex: Coluna B = 1
        const INDICE_HORARIO = 5;    // Ex: Coluna F = 5

        for (let i = 1; i < rows.length; i++) { 
            const row = rows[i];
            
            const rowData = row[INDICE_DATA] ? String(row[INDICE_DATA]).trim() : '';
            const rowEmpresa = row[INDICE_EMPRESA] ? String(row[INDICE_EMPRESA]).trim() : '';
            const rowRota = row[INDICE_ROTA] ? String(row[INDICE_ROTA]).trim() : '';
            const rowProg = row[INDICE_HORARIO] ? String(row[INDICE_HORARIO]).trim().substring(0, 5) : '';

            // Verifica se achou a linha exata que o usuário editou
            if (rowData === data_escala && rowEmpresa === empresa && rowRota === rota && rowProg === h_prog) {
                rowIndex = i + 1; // +1 porque a API conta a partir do 1
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'Viagem exata não encontrada na planilha.' });
        }

        // Atualiza Motorista (Exemplo: Coluna C) -> Sempre com aspas simples no SHEET_NAME
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${SHEET_NAME}'!C${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[novo_motorista]] }
        });

        // Atualiza Frota Enviada (Exemplo: Coluna E) -> Sempre com aspas simples no SHEET_NAME
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${SHEET_NAME}'!E${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[nova_frota]] }
        });

        // 🚀 CRÍTICO: Limpa o cache para forçar a nova leitura!
        const cacheKey = `escala_v2_${data_escala}`;
        escalaCache.del(cacheKey);

        return res.status(200).json({ success: true, message: 'Atualizado com sucesso!' });
    } catch (error) {
        console.error("Erro ao atualizar o Sheets:", error);
        return res.status(500).json({ error: 'Erro interno ao salvar as alterações. Verifique se a aba com esta data existe.' });
    }
};
