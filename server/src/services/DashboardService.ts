import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../../utils/sharedCache'; 

// --- CONFIGURAÇÕES E CONSTANTES ---
const appCache = new NodeCache({ stdTTL: 30 }); 
const enderecoCache = new NodeCache({ stdTTL: 300 }); // Cache de endereço por 5 min
const TIMEZONE = 'America/Sao_Paulo';

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const URL_FULLTRACK_REVERSE = "https://mapageral.ops.fulltrackapp.com/address/v1/reverse/";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const httpsAgent = new https.Agent({ keepAlive: true, timeout: 60000 });

// --- INTERFACES ---
export interface LinhaOutput {
    id: string;
    e: string;      
    r: string;      
    v: string;      
    s: number;      
    pi: string;     
    ri: string;     
    pf: string;     
    pfn: string;    
    u: string;      
    c: string;      
    li?: string;    
    lf?: string;    
    status_api: string; 
    veiculo_pos?: [number, number];
    endereco?: string; // Novo campo solicitado
}

// --- BUSCAR ENDEREÇO (FULLTRACK) ---
const getEnderecoFullTrack = async (idEvento: string, lat: number, lng: number): Promise<string> => {
    const cacheKey = `addr_${idEvento}`;
    const cached = enderecoCache.get<string>(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.post(URL_FULLTRACK_REVERSE, 
            [{ code: String(idEvento), latitude: String(lat), longitude: String(lng) }], 
            {
                headers: {
                    "Authorization": "Bearer d1f44524a49e567b2cdde5cd9ede6341aef766b5",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/javascript, */*; q=0.01"
                },
                timeout: 5000
            }
        );
        // Pega a informação 'description' que vem no primeiro item do array de resposta
        const endereco = res.data?.[0]?.description || "Endereço não identificado";
        enderecoCache.set(cacheKey, endereco);
        return endereco;
    } catch {
        return "Localização indisponível";
    }
};

const getVeiculoPosicaoExata = async (placa: string): Promise<any | null> => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
    try {
        const res = await axios.get(`${URL_RENDER_WORKER}?placa=${cleanPlaca}`, {
            timeout: 5000,
            headers: { "X-Render-Token": RENDER_TOKEN }
        });
        return (res.data && res.data[0]) ? res.data[0] : null;
    } catch {
        return null;
    }
};

const calcularStatus = (categoria: string, pi: string, ri: string, pf: string, pfn: string, horaServidor: string, sentidoIda: boolean): string => {
    if (categoria === "Carro desligado") return "DESLIGADO";
    if (!ri || ri === "N/D") {
        if (!pi || pi === "N/D") return "INDEFINIDO";
        return pi < horaServidor ? "NAO_INICIOU" : "DESLOCAMENTO";
    }
    const cleanRi = ri.split(' ')[0];
    const hoje = moment().format('YYYY-MM-DD');
    const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    if (mPi.isValid() && mRi.isValid() && mRi.diff(mPi, 'minutes') > 10) return "ATRASADO";
    if (sentidoIda === true && pfn && pfn !== "N/D" && pf && pf !== "N/D" && pfn !== "--:--") {
        const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        if (mPf.isValid() && mPfn.isValid() && mPfn.diff(mPf, 'minutes') > 10) return "ATRASADO_PERCURSO";
    }
    return "PONTUAL";
};

export const fetchDashboardData = async (allowedCompanies: string[] | null = null) => {
    let dashboardData = appCache.get('dashboard_main');
    if (!dashboardData) {
        try {
            const response = await axios.get(URL_DASHBOARD_MAIN, { 
                headers: { "Authorization": process.env.TOKEN_ABMBUS || "" }, 
                timeout: 60000, 
                httpsAgent 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        } catch {
            dashboardData = { linhasAndamento: [], linhasCarroDesligado: [], linhasComecaramSemPrimeiroPonto: [] };
        }
    }

    const data: any = dashboardData;
    let todasLinhas: LinhaOutput[] = [];
    const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm');
    const allowedNorm = allowedCompanies ? allowedCompanies.map(c => c.toUpperCase().trim()) : null;

    const processarGrupo = async (lista: any[], categoria: string) => {
        if (!lista) return;
        
        const promessas = lista.map(async (l): Promise<LinhaOutput | null> => {
            if (allowedNorm) {
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!allowedNorm.includes(empNome)) return null;
            }
            if (l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou)) return null;

            let pi = "N/D", ri = "N/D", pf = "N/D", pfn = "N/D", li: string | undefined, lf: string | undefined;
            let diffMinutosSaida = 0, saiu = false;
            const sentidoIda = !!l.sentidoIDA;

            if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                l.pontoDeParadas.forEach((p: any, index: number) => {
                    const tipo = p.tipoPonto?.tipo;
                    if (tipo === "Inicial") {
                        if (p.latitude) li = `${p.latitude},${p.longitude}`;
                        pi = p.horario || pi;
                    }
                    if (ri === "N/D" && tipo !== "Final" && p.passou && (index + 1) <= 4) {
                        if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                            saiu = true;
                            const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario || '00:00'}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                            let dm = typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':') 
                                ? (parseInt(p.tempoDiferenca.split(':')[0]) * 60 + parseInt(p.tempoDiferenca.split(':')[1]))
                                : parseInt(p.tempoDiferenca);
                            if (diffMinutosSaida === 0) diffMinutosSaida = p.atrasado ? dm : -dm;
                            p.atrasado ? baseTime.add(dm, 'minutes') : baseTime.subtract(dm, 'minutes');
                            ri = (tipo !== "Inicial" && (index + 1) > 1) ? `${baseTime.format('HH:mm')} (Pt ${index + 1})` : baseTime.format('HH:mm');
                        }
                    }
                    if (tipo === "Final") {
                        if (p.latitude) lf = `${p.latitude},${p.longitude}`;
                        pf = p.horario || pf;
                    }
                });
            }

            const placa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const cachedPred = predictionCache.get(placa) as any;
            if (cachedPred?.horario) pfn = cachedPred.horario;
            else if (pf !== "N/D" && saiu) pfn = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE).add(diffMinutosSaida, 'minutes').format('HH:mm');
            else if (pf !== "N/D") pfn = "--:--";

            // --- BUSCA POSIÇÃO E ENDEREÇO ---
            let vPos: [number, number] | undefined = undefined;
            let enderecoStr = "N/D";
            
            const vData = await getVeiculoPosicaoExata(placa);
            if (vData) {
                const lat = parseFloat(vData.latitude || vData.loc?.[0] || 0);
                const lng = parseFloat(vData.longitude || vData.loc?.[1] || 0);
                if (lat !== 0) {
                    vPos = [lat, lng];
                    // Busca o endereço usando os dados do Render Worker (ras_eve_aut_id)
                    const idEvento = vData.ras_eve_aut_id || vData.id_evento || "0";
                    enderecoStr = await getEnderecoFullTrack(String(idEvento), lat, lng);
                }
            }

            return {
                id: String(l.idLinha || l.id),
                e: l.empresa?.nome || '',
                r: l.descricaoLinha || '',
                v: l.veiculo?.veiculo || '',
                s: sentidoIda ? 1 : 0, pi, ri, pf, pfn, li, lf, 
                u: String(l.veiculo?.dataHora || l.ultimaData || "N/D"),
                c: categoria,
                status_api: calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda),
                veiculo_pos: vPos,
                endereco: enderecoStr // Campo com a descrição da FullTrack
            };
        });

        const resultados = await Promise.all(promessas);
        resultados.forEach(res => { if (res) todasLinhas.push(res); });
    };

    await processarGrupo(data.linhasAndamento, "Em andamento");
    await processarGrupo(data.linhasCarroDesligado, "Carro desligado");
    await processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

    return { todas_linhas: todasLinhas, hora: horaAtualServidor };
};
