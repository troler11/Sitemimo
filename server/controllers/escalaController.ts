import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const escalaCache = new NodeCache({ stdTTL: 60 });

// A sua URL atualizada do Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxNzGvOtAjURyletoGmeXYa_NYk3DFGE4C2EW570iAHtQ5MmxodP-mydFSeo_nB21Q7/exec';

// ==========================================
// FUNÇÃO DE PROCESSAMENTO
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
        obs: findCol(['observação', 'obs', 'ocorrencia','observações']),
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
        // A mesmíssima URL que funcionou no seu Chrome
        const urlGoogle = 'https://script.google.com/macros/s/AKfycbxNzGvOtAjURyletoGmeXYa_NYk3DFGE4C2EW570iAHtQ5MmxodP-mydFSeo_nB21Q7/exec?action=getMotoristas';
        
        console.log("Buscando motoristas usando FETCH NATIVO (Modo Navegador)...");
        
        const response = await fetch(urlGoogle, {
            method: 'GET',
            redirect: 'follow' // 🔥 O SEGREDO: Manda o servidor seguir o redirecionamento do Google sem se perder
        });

        const texto = await response.text(); // Pega a resposta crua primeiro
        
        try {
            const motoristasUnicos = JSON.parse(texto);
            
            if (Array.isArray(motoristasUnicos)) {
                return res.json(motoristasUnicos);
            } else {
                return res.json([]);
            }
        } catch (parseError) {
            // Se o Google tentar mandar uma tela de login HTML, ele cai aqui
            console.error("Erro! O Google não mandou JSON. Mandou isto:", texto.substring(0, 150));
            return res.json([]);
        }

    } catch (error) {
        console.error("Erro ao buscar motoristas:", error);
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
            timeout: 60000 // ⏳ Limite aumentado para 60s
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
// ROTA PUT: ATUALIZAR DADOS (Manda pro Google Salvar)
// ==========================================
export const atualizarEscala = async (req: Request, res: Response) => {
    const { data_escala, empresa, rota, h_prog, novo_motorista, nova_frota, novo_status } = req.body;

    if (!data_escala) {
        return res.status(400).json({ error: "Data não informada para atualização" });
    }

    try {
        // 1. Envia a atualização para o Google Apps Script
        const response = await axios.post(GOOGLE_SCRIPT_URL, {
            action: 'update',
            data_escala: data_escala,
            empresa: empresa,
            rota: rota,
            h_prog: h_prog,
            novo_motorista: novo_motorista,
            nova_frota: nova_frota,
            novo_status: novo_status // Enviando o status novo para o Google
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // ⏳ Limite de 60s
        });

        if (response.data && response.data.error) {
            return res.status(404).json({ error: response.data.error });
        }

        // 2. Atualiza o Cache Local (para a tela não piscar com dados antigos)
        const cacheKey = `escala_v2_${data_escala}`; // <-- Declarado corretamente
        
        if (typeof escalaCache !== 'undefined') {
            const dadosEmMemoria = escalaCache.get(cacheKey) as any[];
            
            if (dadosEmMemoria && Array.isArray(dadosEmMemoria)) {
                const cacheAtualizado = dadosEmMemoria.map(item => {
                    // Se encontrou a viagem que acabamos de editar...
                    if (item.empresa === empresa && item.rota === rota && item.h_prog === h_prog) {
                        
                        // Lógica de Titular x Reserva
                        let novoReserva = item.reserva; // <-- Declarado corretamente
                        const motTitular = String(item.motorista).trim().toUpperCase();
                        const motEnviado = String(novo_motorista).trim().toUpperCase();

                        if (motEnviado !== motTitular && motEnviado !== "") {
                            novoReserva = novo_motorista; 
                        } else {
                            novoReserva = ""; 
                        }

                        // Retorna o item na memória com as novas informações
                        return { 
                            ...item, 
                            reserva: novoReserva, 
                            frota_enviada: nova_frota,
                            // Atualiza os booleanos do status na memória
                            manutencao: novo_status === 'Manutenção', 
                            aguardando: novo_status === 'Aguardando'
                        };
                    }
                    return item; // Linhas não editadas passam direto
                });
                
                escalaCache.set(cacheKey, cacheAtualizado);
            }
        }

        return res.status(200).json({ success: true, message: 'Atualizado com sucesso!' });
    } catch (error) {
        console.error("Erro ao atualizar o Sheets:", error);
        return res.status(500).json({ error: 'Erro interno ao salvar as alterações.' });
    }
};
