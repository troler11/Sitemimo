import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../../utils/sharedCache'; 

// --- CONFIGURAÇÕES E CONSTANTES ---
const appCache = new NodeCache({ stdTTL: 30 }); // Cache de 30 segundos
const TIMEZONE = 'America/Sao_Paulo';

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
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
    e: string;      // Empresa
    r: string;      // Rota
    v: string;      // Veículo
    s: number;      // Sentido
    pi: string;     // Programado Início
    ri: string;     // Real Início
    pf: string;     // Programado Fim
    pfn: string;    // Previsão Fim Nova
    u: string;      // Último Reporte
    c: string;      // Categoria
    li?: string;    // Lat/Long Inicial
    lf?: string;    // Lat/Long Final
    status_api: string; 
    mapa_trajeto?: string; // URL da imagem estática do trajeto
}

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

    if (sentidoIda === true && pfn && pfn !== "N/D" && pf && pf !== "N/D" && pfn !== "--:--") {
        const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        if (mPf.isValid() && mPfn.isValid()) {
             const diffChegada = mPfn.diff(mPf, 'minutes');
             if (diffChegada > 10) return "ATRASADO_PERCURSO";
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
                headers: { ...HEADERS_DASHBOARD_MAIN, "Connection": "keep-alive" }, 
                timeout: 60000,
                httpsAgent: httpsAgent 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        } catch (apiError: any) {
            console.error("⚠️ Falha na API Externa:", apiError.message);
            dashboardData = { linhasAndamento: [], linhasCarroDesligado: [], linhasComecaramSemPrimeiroPonto: [] };
        }
    }

    const data: any = dashboardData;
    let todasLinhas: LinhaOutput[] = [];
    const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm');
    const allowedNorm = allowedCompanies ? allowedCompanies.map(c => c.toUpperCase().trim()) : null;

    const processarGrupo = (lista: any[], categoria: string) => {
        if (!lista) return;
        
        for (const l of lista) {
            if (allowedNorm) {
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!allowedNorm.includes(empNome)) continue;
            }

            const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
            if (finalizada) continue;

            let pi = "N/D", ri = "N/D", pf = "N/D", pfn = "N/D", li = "N/D", lf = "N/D";
            let rawDate = l.veiculo?.dataHora || l.veiculo?.dataComunicacao || l.ultimaData;
            let u = rawDate ? String(rawDate) : "N/D";
            let diffMinutosSaida = 0, saiu = false;
            const sentidoIda = !!l.sentidoIDA;

            // --- PROCESSAMENTO DE PONTOS ---
            const pontosValidos = l.pontoDeParadas?.filter((p: any) => p.latitude && p.longitude) || [];

            for (const p of l.pontoDeParadas || []) {
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
                        
                        diffMinutosSaida = p.atrasado ? dm : -dm;
                        p.atrasado ? baseTime.add(dm, 'minutes') : baseTime.subtract(dm, 'minutes');
                        ri = tipo !== "Inicial" ? `${baseTime.format('HH:mm')} (Pt ${indexPonto})` : baseTime.format('HH:mm');
                    }
                }
                if (tipo === "Final") {
                    if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                    if (p.horario) pf = p.horario;
                }
            }

            // --- LÓGICA DE PREVISÃO ---
            const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const cachedPred = predictionCache.get(placaLimpa) as any;
            if (cachedPred?.horario) pfn = cachedPred.horario;
            else if (pf !== "N/D" && saiu) {
                pfn = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE).add(diffMinutosSaida, 'minutes').format('HH:mm');
            } else if (pf !== "N/D") pfn = "--:--";

            // --- DESENHO DO MAPA OTIMIZADO ---
            const polyline = pontosValidos
                .map((p: any) => `${p.longitude},${p.latitude}`)
                .slice(0, 60) // Limite para evitar URL quebrada
                .join(',');

            const marcadoresParadas = pontosValidos
                .slice(0, 35) // Máximo de marcadores visíveis
                .map((p: any, idx: number) => {
                    const cor = p.passou ? 'gn' : 'rd';
                    const formato = (idx === 0 || idx === pontosValidos.length - 1) ? 'pm2b' : 'pm2';
                    return `pt=${p.longitude},${p.latitude},${formato}${cor}m${idx + 1}`;
                })
                .join('&');

            const latV = l.veiculo?.latitude;
            const lonV = l.veiculo?.longitude;
            const marcadorBus = latV && lonV ? `&pt=${lonV},${latV},pmlbm` : '';

            // Cor azul claro (4ec4ff) com espessura 5
            const urlMapaFinal = polyline 
                ? `https://static-maps.yandex.ru/1.x/?lang=pt_BR&l=map&size=600,450&pl=c:4ec4ff77,w:5,${polyline}${marcadorBus}&${marcadoresParadas}`
                : 'N/D';

            const statusApi = calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda);

            todasLinhas.push({
                id: l.idLinha || l.id,
                e: l.empresa?.nome || '',
                r: l.descricaoLinha || '',
                v: l.veiculo?.veiculo || '',
                s: sentidoIda ? 1 : 0, 
                pi, ri, pf, pfn, u, li, lf,
                c: categoria,
                status_api: statusApi,
                mapa_trajeto: urlMapaFinal
            });
        }
    };

    processarGrupo(data.linhasAndamento, "Em andamento");
    processarGrupo(data.linhasCarroDesligado, "Carro desligado");
    processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

    return { todas_linhas: todasLinhas, hora: horaAtualServidor };
};
