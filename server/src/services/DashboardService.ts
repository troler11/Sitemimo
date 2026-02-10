import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../../utils/sharedCache'; 

// --- CONFIGURAÇÕES E CONSTANTES ---
const appCache = new NodeCache({ stdTTL: 30 }); // Cache de 30 segundos
const TIMEZONE = 'America/Sao_Paulo';

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};

// Agente HTTPS para evitar ECONNRESET em conexões longas/instáveis
const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 60000,
    scheduling: 'lifo'
});

const INPUT_FORMATS = [
    "DD/MM/YYYY HH:mm:ss", 
    "DD/MM/YYYY HH:mm", 
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DDTHH:mm:ss",
    moment.ISO_8601
];

// --- INTERFACES ---
export interface LinhaOutput {
    id: string;
    e: string;      // Empresa
    r: string;      // Rota
    v: string;      // Veículo (Placa)
    s: number;      // Sentido (1=Ida, 0=Volta)
    pi: string;     // Programado Início
    ri: string;     // Real Início
    pf: string;     // Programado Fim
    pfn: string;    // Previsão Fim Nova (Estimada)
    u: string;      // Último Reporte
    c: string;      // Categoria (Status Bruto)
    li?: string;    // Lat/Long Inicial
    lf?: string;    // Lat/Long Final
    status_api: string; // Status Calculado (ATRASADO, PONTUAL, ETC)
    veiculo_pos?: [number, number]; // <--- Campo para Coordenadas Reais
}

// --- FUNÇÃO AUXILIAR: POSIÇÃO DO RASTREADOR (RENDER) ---
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

// --- FUNÇÃO AUXILIAR: CALCULAR STATUS ---
const calcularStatus = (
    categoria: string, 
    pi: string, 
    ri: string, 
    pf: string, 
    pfn: string, 
    horaServidor: string,
    sentidoIda: boolean
): string => {
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
        const diffMinutos = mRi.diff(mPi, 'minutes');
        if (diffMinutos > 10) return "ATRASADO";
    }

    if (sentidoIda === true) { 
        if (pfn && pfn !== "N/D" && pf && pf !== "N/D" && pfn !== "--:--") {
            const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            if (mPf.isValid() && mPfn.isValid()) {
                 const diffChegada = mPfn.diff(mPf, 'minutes');
                 if (diffChegada > 10) return "ATRASADO_PERCURSO";
            }
        }
    }
    return "PONTUAL";
};

// --- SERVIÇO PRINCIPAL ---
export const fetchDashboardData = async (allowedCompanies: string[] | null = null) => {
    let dashboardData = appCache.get('dashboard_main');
    
    if (!dashboardData) {
        try {
            const response = await axios.get(URL_DASHBOARD_MAIN, { 
                headers: {
                    ...HEADERS_DASHBOARD_MAIN,
                    "Connection": "keep-alive",
                    "User-Agent": "Node.js/Service"
                }, 
                timeout: 60000,
                httpsAgent: httpsAgent 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        } catch (apiError: any) {
            console.error("⚠️ Service: Falha na API Externa:", apiError.code || apiError.message);
            dashboardData = { linhasAndamento: [], linhasCarroDesligado: [], linhasComecaramSemPrimeiroPonto: [] };
        }
    }

    const data: any = dashboardData;
    let todasLinhas: LinhaOutput[] = [];
    const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm');
    const allowedNorm = allowedCompanies ? allowedCompanies.map(c => c.toUpperCase().trim()) : null;

    // Função interna adaptada para Assíncrona para buscar a posição
    const processarGrupo = async (lista: any[], categoria: string) => {
        if (!lista) return;
        
        const promessas = lista.map(async (l) => {
            // A. Filtro de Empresa
            if (allowedNorm) {
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!allowedNorm.includes(empNome)) return null;
            }

            // B. Ignorar linhas finalizadas
            const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
            if (finalizada) return null;

            // --- PROCESSAMENTO DE DADOS (MANTIDO) ---
            let pi = "N/D", ri = "N/D", pf = "N/D", pfn = "N/D", li = "N/D", lf = "N/D";
            let u = "N/D";
            let rawDate = l.veiculo?.dataHora || l.veiculo?.dataComunicacao || l.ultimaData;
            if (rawDate) u = String(rawDate);
            
            let diffMinutosSaida = 0; 
            let saiu = false;
            const sentidoIda = !!l.sentidoIDA;

            if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                for (const p of l.pontoDeParadas) {
                    const tipo = p.tipoPonto?.tipo;
                    const indexPonto = l.pontoDeParadas.indexOf(p) + 1; 

                    if (tipo === "Inicial") {
                        if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                        if (p.horario) pi = p.horario;
                    }

                    if (ri === "N/D" && tipo !== "Final" && p.passou && indexPonto <= 4) {
                        if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                            saiu = true; 
                            const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario || '00:00'}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                            let dm = typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':') 
                                ? (parseInt(p.tempoDiferenca.split(':')[0]) * 60 + parseInt(p.tempoDiferenca.split(':')[1]))
                                : parseInt(p.tempoDiferenca);
                            
                            if (diffMinutosSaida === 0) diffMinutosSaida = p.atrasado ? dm : -dm;
                            p.atrasado ? baseTime.add(dm, 'minutes') : baseTime.subtract(dm, 'minutes');
                            const horaCalculada = baseTime.format('HH:mm');
                            ri = (tipo !== "Inicial" && indexPonto > 1) ? `${horaCalculada} (Pt ${indexPonto})` : horaCalculada;
                        }
                    }
                    if (tipo === "Final") {
                        if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                        if (p.horario) pf = p.horario;
                    }
                }
            }

            // D. Validação Tolerância
            if (pi !== "N/D" && ri !== "N/D") {
                const mPi = moment.tz(`${moment().format('YYYY-MM-DD')} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                const mRi = moment.tz(`${moment().format('YYYY-MM-DD')} ${ri.split(' ')[0]}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                if (mPi.isValid() && mRi.isValid() && Math.abs(mRi.diff(mPi, 'minutes')) > 40) {
                    ri = "N/D"; saiu = false; diffMinutosSaida = 0;
                }
            }

            // E. Previsão Chegada
            const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const cachedPred = predictionCache.get(placaLimpa) as any;
            if (cachedPred?.horario) pfn = cachedPred.horario;
            else if (pf !== "N/D" && saiu) {
                pfn = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE).add(diffMinutosSaida, 'minutes').format('HH:mm');
            } else if (pf !== "N/D") pfn = "--:--";

            // --- BUSCA POSIÇÃO REAL (NOVA) ---
            let vPos: [number, number] | undefined = undefined;
            if (l.veiculo?.veiculo) {
                const pos = await getVeiculoPosicaoExata(l.veiculo.veiculo);
                if (pos) vPos = pos;
            }

            // G. Montagem do Objeto (MANTIDO + veiculo_pos)
            return {
                id: l.idLinha || l.id,
                e: l.empresa?.nome || '',
                r: l.descricaoLinha || '',
                v: l.veiculo?.veiculo || '',
                s: sentidoIda ? 1 : 0, 
                pi, ri, pf, pfn, li, lf, u,
                c: categoria,
                status_api: calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda),
                veiculo_pos: vPos
            };
        });

        const resultados = await Promise.all(promessas);
        todasLinhas.push(...resultados.filter((r): r is LinhaOutput => r !== null));
    };

    // Chamadas assíncronas para os grupos
    await processarGrupo(data.linhasAndamento, "Em andamento");
    await processarGrupo(data.linhasCarroDesligado, "Carro desligado");
    await processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

    return { todas_linhas: todasLinhas, hora: horaAtualServidor };
};
