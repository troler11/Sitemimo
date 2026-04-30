import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import { z } from 'zod';

const escalaCache = new NodeCache({ stdTTL: 60 });

// 1. SEGURANÇA DA URL: Mova essa URL para o seu arquivo .env em produção!
// Ex: GOOGLE_SCRIPT_URL=https://script.google.com/...
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxNzGvOtAjURyletoGmeXYa_NYk3DFGE4C2EW570iAHtQ5MmxodP-mydFSeo_nB21Q7/exec';

// ==========================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// ==========================================
const updateEscalaSchema = z.object({
    data_escala: z.string().min(6, "Data inválida"),
    empresa: z.string().min(1, "Empresa é obrigatória"),
    rota: z.string().min(1, "Rota é obrigatória"),
    h_prog: z.string().min(1, "Horário é obrigatório"),
    novo_motorista: z.string().optional().default(""),
    nova_frota: z.string().optional().default(""),
    novo_status: z.string().optional().default("")
});

// ==========================================
// FUNÇÃO DE PROCESSAMENTO (Mantida igual, pois é a regra de negócio do Sheets)
// ==========================================
const processarDados = (rows: any[]) => {
    if (!Array.isArray(rows) || rows.length < 2) return [];

    const header = rows[0].map((col: string) => String(col).trim().toLowerCase());

    const findCol = (keywords: string[]) => {
        for (let i = 0; i < header.length; i++) {
            for (const key of keywords) {
                if (header[i].includes(key)) return i;
            }
        }
        return -1;
    };

    const map = {
        empresa: findCol(['clientes', 'cliente', 'empresa', 'clientes']),
        rota: findCol(['rota', 'linha', 'itinerario']),
        motorista: findCol(['motorista', 'condutor', 'mot']),
        reserva: findCol(['reserva']),
        escala: findCol(['escala', 'veiculo escala']),
        enviada: findCol(['enviada', 'veiculo enviado']),
        prog: findCol(['ini', 'inicio', 'prog']),
        real: findCol(['real', 'realizado', 'chegada']),
        obs: findCol(['motivo troca?']),
        hr_sai: findCol(['sai', 'saida']),
        sentido: findCol(['ent', 'entrada', 'sentido']),
        manut: findCol(['manutenção', 'manut', 'observações', 'observação']),
        carro: findCol(['aguardando', 'carro','observações', 'observação']),
        ra: findCol(['ra', 'r.a', 'registro'])
    };

    const dadosProcessados: any[] = [];
    const limparHorario = (val: any) => (!val ? '' : String(val).trim().substring(0, 5));

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[map.empresa] && !r[map.rota]) continue;

        const empresa = r[map.empresa] ? String(r[map.empresa]).trim() : '---';
        const rota = r[map.rota] ? String(r[map.rota]).trim() : '---';

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
            hr_sai: limparHorario(r[map.hr_sai]), 
            sentido: r[map.sentido] ? String(r[map.sentido]).trim() : '',
            obs: r[map.obs] || '',
            ra_val: r[map.ra] || '',
            manutencao: (valManut.includes('sim') || valManut.includes('manuten')),
            aguardando: (valCarro.includes('sim') || valCarro.includes('aguard')),
        });
    }

    return dadosProcessados.sort((a, b) => {
        if (a.h_prog === b.h_prog) return 0;
        return a.h_prog < b.h_prog ? -1 : 1;
    });
};

// ==========================================
// ROTA GET: BUSCAR MOTORISTAS 
// ==========================================
export const getMotoristas = async (req: Request, res: Response) => {
    try {
        const urlGoogle = `${GOOGLE_SCRIPT_URL}?action=getMotoristas`;
        
        const response = await fetch(urlGoogle, { method: 'GET', redirect: 'follow' });
        const texto = await response.text(); 
        
        try {
            const motoristasUnicos = JSON.parse(texto);
            return res.json(Array.isArray(motoristasUnicos) ? motoristasUnicos : []);
        } catch (parseError) {
            console.error("🚨 Erro de Parse (Provável bloqueio do Google):", texto.substring(0, 150));
            return res.json([]);
        }
    } catch (error) {
        console.error("🚨 Erro GET /motoristas:", error);
        return res.status(500).json({ error: 'Erro ao buscar a lista de motoristas.' });
    }
};

// ==========================================
// ROTA GET: BUSCAR DADOS DA ESCALA
// ==========================================
export const getEscala = async (req: Request, res: Response) => {
    const dataFiltro = req.query.data as string; 
    
    if (!dataFiltro || typeof dataFiltro !== 'string') {
        return res.status(400).json({ error: "Data não informada no formato correto." });
    }

    // 2. RECUPERAÇÃO DO CONTEXTO DE SEGURANÇA DO USUÁRIO
    const user = (req as any).user;
    const isAdmin = user?.role === 'admin';
    const userCompanies = Array.isArray(user?.allowed_companies) ? user.allowed_companies.map((c: any) => String(c).trim()) : [];

    const cacheKey = `escala_v2_${dataFiltro}`;
    let dadosLimpos: any[] = escalaCache.get(cacheKey) || [];

    if (dadosLimpos.length === 0) {
        try {
            const response = await axios.get(GOOGLE_SCRIPT_URL, {
                params: { action: 'read', data: dataFiltro },
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 60000 
            });

            dadosLimpos = processarDados(response.data);
            escalaCache.set(cacheKey, dadosLimpos);
        } catch (error) {
            console.error("🚨 Erro Axios Escala:", error);
            return res.status(500).json({ error: "Serviço do Google indisponível no momento." });
        }
    }

    // 3. ISOLAMENTO DE EMPRESAS (Apenas envia as empresas que o usuário tem permissão)
    if (!isAdmin) {
        dadosLimpos = dadosLimpos.filter(item => userCompanies.includes(String(item.empresa).trim()));
    }

    return res.json(dadosLimpos);
};

// ==========================================
// ROTA PUT: ATUALIZAR DADOS
// ==========================================
export const atualizarEscala = async (req: Request, res: Response) => {
    try {
        // 4. VALIDAÇÃO ZOD (Bloqueia dados maliciosos antes de chegar no Google ou no Cache)
        const validData = updateEscalaSchema.parse(req.body);

        // 5. BLOQUEIO DE ESCRITA NÃO AUTORIZADA
        const user = (req as any).user;
        const isAdmin = user?.role === 'admin';
        const userCompanies = Array.isArray(user?.allowed_companies) ? user.allowed_companies.map((c: any) => String(c).trim()) : [];

        if (!isAdmin && !userCompanies.includes(validData.empresa)) {
            return res.status(403).json({ error: "Você não tem permissão para editar dados desta empresa." });
        }

        // Envia para o Google Apps Script
        const response = await axios.post(GOOGLE_SCRIPT_URL, {
            action: 'update',
            data_escala: validData.data_escala,
            empresa: validData.empresa,
            rota: validData.rota,
            h_prog: validData.h_prog,
            novo_motorista: validData.novo_motorista,
            nova_frota: validData.nova_frota,
            novo_status: validData.novo_status 
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        if (response.data?.error) {
            return res.status(404).json({ error: response.data.error });
        }

        // Atualiza o Cache Local de forma segura (usando apenas os dados validados pelo Zod)
        const cacheKey = `escala_v2_${validData.data_escala}`; 
        
        if (typeof escalaCache !== 'undefined') {
            const dadosEmMemoria = escalaCache.get(cacheKey) as any[];
            
            if (Array.isArray(dadosEmMemoria)) {
                const cacheAtualizado = dadosEmMemoria.map(item => {
                    if (item.empresa === validData.empresa && item.rota === validData.rota && item.h_prog === validData.h_prog) {
                        
                        let novoReserva = item.reserva; 
                        const motTitular = String(item.motorista).trim().toUpperCase();
                        const motEnviado = String(validData.novo_motorista).trim().toUpperCase();

                        if (motEnviado !== motTitular && motEnviado !== "") {
                            novoReserva = validData.novo_motorista; 
                        } else {
                            novoReserva = ""; 
                        }

                        return { 
                            ...item, 
                            reserva: novoReserva, 
                            frota_enviada: validData.nova_frota,
                            manutencao: validData.novo_status === 'MANUTENÇÃO', 
                            aguardando: validData.novo_status === 'PENDENTE DE CONFIRMAÇÃO',
                            confirmado: validData.novo_status === 'CONFIRMADO',
                            cobrir: validData.novo_status === 'COBRIR',
                            realocado: validData.novo_status === 'REALOCADO'
                        };
                    }
                    return item; 
                });
                
                escalaCache.set(cacheKey, cacheAtualizado);
            }
        }

        return res.status(200).json({ success: true, message: 'Atualizado com sucesso!' });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Dados de atualização inválidos." });
        }
        console.error("🚨 Erro ao atualizar o Sheets:", error);
        return res.status(500).json({ error: 'Erro interno ao salvar as alterações.' });
    }
};
