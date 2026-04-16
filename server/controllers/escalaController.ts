import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const escalaCache = new NodeCache({ stdTTL: 60 });

// 👇 Coloque aqui a URL do seu Google Apps Script (Terminada em /exec)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhQNK2NnlOmWKX1Ahd4xRBrnXPX8IIXH35vSWE8YnQh8eL2mKxcHI67TLwtwF01wKO/exec';

// ==========================================
// FUNÇÃO DE PROCESSAMENTO (MANTIDA INTACTA)
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
// ROTA GET: BUSCAR MOTORISTAS (VIA SCRIPT)
// ==========================================
export const getMotoristas = async (req: Request, res: Response): Promise<Response> => {
    const cacheKey = 'lista_motoristas';
    const cached = escalaCache.get(cacheKey);
    
    if (cached) return res.json(cached);

    try {
        // Agora quem busca na planilha é o Google Apps Script, não o Node.js!
        const response = await axios.get(GOOGLE_SCRIPT_URL, {
            params: { action: 'getMotoristas' }
        });

        const motoristasUnicos = response.data;
        
        if (Array.isArray(motoristasUnicos)) {
            escalaCache.set(cacheKey, motoristasUnicos, 3600);
            return res.json(motoristasUnicos);
        } else {
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
// RECEBE AS REQUISIÇÕES DE ATUALIZAÇÃO (POST)
// ==========================================
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    
    if (params.action === 'update') {
      var sheetName = params.data_escala;
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Aba com a data não encontrada"})).setMimeType(ContentService.MimeType.JSON);
      
      // 🔥 A MÁGICA: getDisplayValues() lê exatamente o texto visível na tela ("05:30")
      var data = sheet.getDataRange().getDisplayValues(); 
      var rowIndex = -1;
      
      // Procura a linha exata
      for (var i = 1; i < data.length; i++) {
        var rowEmpresa = String(data[i][0]).trim(); // Coluna A
        var rowRota = String(data[i][1]).trim();    // Coluna B
        var rowProg = String(data[i][5]).trim().substring(0, 5); // Coluna F
        
        // Verifica se a Empresa, a Rota e o Horário batem perfeitamente
        if (rowEmpresa === params.empresa && rowRota === params.rota && rowProg === params.h_prog) {
          rowIndex = i + 1; // +1 porque a API conta a partir do 1
          break;
        }
      }
      
      if (rowIndex === -1) {
        // Se não achar, devolve exatamente o que ele tentou procurar para ajudar no debug
        return ContentService.createTextOutput(JSON.stringify({error: "Viagem não encontrada. Procurou por: " + params.empresa + " | " + params.rota + " | " + params.h_prog})).setMimeType(ContentService.MimeType.JSON);
      }
      
      // Atualiza a Frota na Coluna H (Índice 8)
      sheet.getRange(rowIndex, 8).setValue(params.nova_frota);

      // Atualiza o Motorista na Coluna K (Índice 11)
      sheet.getRange(rowIndex, 11).setValue(params.novo_motorista);
      
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.message})).setMimeType(ContentService.MimeType.JSON);
  }
};
// ==========================================
// ROTA PUT: ATUALIZAR DADOS (VIA SCRIPT POST)
// ==========================================
export const atualizarEscala = async (req: Request, res: Response) => {
    const { data_escala, empresa, rota, h_prog, novo_motorista, nova_frota } = req.body;

    if (!data_escala) {
        return res.status(400).json({ error: "Data não informada para atualização" });
    }

    try {
        // Envia os dados para o Google Apps Script fazer a edição
        const response = await axios.post(GOOGLE_SCRIPT_URL, {
            action: 'update',
            data_escala: data_escala,
            empresa: empresa,
            rota: rota,
            h_prog: h_prog,
            novo_motorista: novo_motorista,
            nova_frota: nova_frota
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Se o Script do Google retornar um erro formatado
        if (response.data && response.data.error) {
            return res.status(404).json({ error: response.data.error });
        }

        // Limpa o cache para forçar a nova leitura na tela
        const cacheKey = `escala_v2_${data_escala}`;
        escalaCache.del(cacheKey);

        return res.status(200).json({ success: true, message: 'Atualizado com sucesso!' });
    } catch (error) {
        console.error("Erro ao atualizar o Sheets:", error);
        return res.status(500).json({ error: 'Erro interno ao salvar as alterações.' });
    }
};
