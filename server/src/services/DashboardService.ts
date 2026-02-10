import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../../utils/sharedCache'; 

// --- CONFIGURAÇÕES E CONSTANTES ---
const appCache = new NodeCache({ stdTTL: 30 }); 
const TIMEZONE = 'America/Sao_Paulo';

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};

const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 60000,
    scheduling: 'lifo'
});

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
}

const getVeiculoPosicaoExata = async (placa: string): Promise<[number, number] | null> => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
    try {
        const res = await axios.get(`${URL_RENDER_WORKER}?placa=${cleanPlaca}`, {
            timeout: 5000,
            headers: { "X-Render-Token": RENDER_TOKEN }
        });
        if (res.data && res.data[0]) {
            const v = res.data[0];
            const lat = parseFloat(v.latitude || v.loc?.[0] || 0);
            const lng = parseFloat(v.longitude || v.loc?.[1] || 0);
            return (lat !== 0 && lng !== 0) ? [lat, lng] : null;
        }
        return null;
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
    if (mPi.isValid() && mRi.isValid()) {
        if (mRi.diff(mPi, 'minutes') > 10) return "ATRASADO";
    }
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
            const response = await axios.get(URL_DASHBOARD_MAIN, { headers: { ...HEADERS_DASHBOARD_MAIN, "Connection": "keep-alive" }, timeout: 60000, httpsAgent });
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

            let pi = "N/D", ri = "N/D", pf = "N/D", pfn = "N/D", li: string | undefined = undefined, lf: string | undefined = undefined;
            let u = l.veiculo?.dataHora || l.veiculo?.dataComunicacao || l.ultimaData || "N/D";
            let diffMinutosSaida = 0, saiu = false;
            const sentidoIda = !!l.sentidoIDA;

            if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                l.pontoDeParadas.forEach((p, index) => {
                    const tipo = p.tipoPonto?.tipo;
                    const idx = index + 1;
                    if (tipo === "Inicial") {
                        if (p.latitude) li = `${p.latitude},${p.longitude}`;
                        pi = p.horario || pi;
                    }
                    if (ri === "N/D" && tipo !== "Final" && p.passou && idx <= 4) {
                        if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                            saiu = true;
                            const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario || '00:00'}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                            let dm = typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':') 
                                ? (parseInt(p.tempoDiferenca.split(':')[0]) * 60 + parseInt(p.tempoDiferenca.split(':')[1]))
                                : parseInt(p.tempoDiferenca);
                            if (diffMinutosSaida === 0) diffMinutosSaida = p.atrasado ? dm : -dm;
                            p.atrasado ? baseTime.add(dm, 'minutes') : baseTime.subtract(dm, 'minutes');
                            ri = (tipo !== "Inicial" && idx > 1) ? `${baseTime.format('HH:mm')} (Pt ${idx})` : baseTime.format('HH:mm');
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

            let vPos: [number, number] | undefined = undefined;
            if (l.veiculo?.veiculo) {
                const pos = await getVeiculoPosicaoExata(l.veiculo.veiculo);
                if (pos) vPos = pos;
            }

            return {
                id: String(l.idLinha || l.id),
                e: l.empresa?.nome || '',
                r: l.descricaoLinha || '',
                v: l.veiculo?.veiculo || '',
                s: sentidoIda ? 1 : 0, pi, ri, pf, pfn, li, lf, u: String(u),
                c: categoria,
                status_api: calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda),
                veiculo_pos: vPos
            };
        });

        const resultados = await Promise.all(promessas);
        // Filtro corrigido para TypeScript reconhecer que removeu nulos
        resultados.forEach(res => { if (res) todasLinhas.push(res); });
    };

    await processarGrupo(data.linhasAndamento, "Em andamento");
    await processarGrupo(data.linhasCarroDesligado, "Carro desligado");
    await processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

    return { todas_linhas: todasLinhas, hora: horaAtualServidor };
};
