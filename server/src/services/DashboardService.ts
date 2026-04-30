import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../../utils/sharedCache'; 
import { z } from 'zod'; // <-- Adicionado para segurança

// --- CONFIGURAÇÕES E CONSTANTES ---
const appCache = new NodeCache({ stdTTL: 30 }); 
const TIMEZONE = 'America/Sao_Paulo';

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";

// 1. SEGURANÇA DE AMBIENTE: Garante que o token existe antes de tentar usar
const TOKEN_ABMBUS = process.env.TOKEN_ABMBUS || "";
if (!TOKEN_ABMBUS) {
    console.error("🚨 ERRO CRÍTICO: TOKEN_ABMBUS não está definido no .env!");
}

const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": TOKEN_ABMBUS
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
    pontos?: any[]; 
}

// 2. SCHEMAS DE PROTEÇÃO (ZOD)
// Garante que o input interno seja sempre um array de strings válido
const allowedCompaniesSchema = z.array(z.string()).nullable();

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
    // Sanitização básica para evitar erros se vierem dados corrompidos
    const catSafe = String(categoria || "").trim();
    const piSafe = String(pi || "N/D").trim();
    const riSafe = String(ri || "N/D").trim();
    const pfSafe = String(pf || "N/D").trim();
    const pfnSafe = String(pfn || "N/D").trim();

    if (catSafe === "Carro desligado") return "DESLIGADO";

    if (riSafe === "N/D") {
        if (piSafe === "N/D") return "INDEFINIDO";
        return piSafe < horaServidor ? "NAO_INICIOU" : "DESLOCAMENTO";
    }

    // 3. PROTEÇÃO DE STRING: Garante que o split não quebre se ri não for string
    const cleanRi = riSafe.split(' ')[0]; 
    const hoje = moment().format('YYYY-MM-DD');
    
    const mPi = moment.tz(`${hoje} ${piSafe}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

    if (mPi.isValid() && mRi.isValid()) {
        const diffMinutos = mRi.diff(mPi, 'minutes');
        if (diffMinutos > 10) return "ATRASADO"; 
    }

    if (sentidoIda === true) { 
        if (pfnSafe !== "N/D" && pfSafe !== "N/D" && pfnSafe !== "--:--") {
            const mPf = moment.tz(`${hoje} ${pfSafe}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            const mPfn = moment.tz(`${hoje} ${pfnSafe}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            
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
    // 4. VALIDAÇÃO DE ENTRADA: Evita que sujeira quebre o mapeamento de empresas
    const safeAllowedCompanies = allowedCompaniesSchema.parse(allowedCompanies);

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
            console.error("⚠️ Service: Falha na API Externa ABMBus:", apiError.code || apiError.message);
            dashboardData = { 
                linhasAndamento: [], 
                linhasCarroDesligado: [], 
                linhasComecaramSemPrimeiroPonto: [] 
            };
        }
    }

    // 5. PROTEÇÃO DE ESTRUTURA: Garante que os dados sejam arrays iteráveis
    const data: any = dashboardData || {};
    const andamento = Array.isArray(data.linhasAndamento) ? data.linhasAndamento : [];
    const desligado = Array.isArray(data.linhasCarroDesligado) ? data.linhasCarroDesligado : [];
    const semPonto = Array.isArray(data.linhasComecaramSemPrimeiroPonto) ? data.linhasComecaramSemPrimeiroPonto : [];

    let todasLinhas: LinhaOutput[] = [];
    const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm');

    const allowedNorm = safeAllowedCompanies ? safeAllowedCompanies.map(c => String(c).toUpperCase().trim()) : null;

    const processarGrupo = (lista: any[], categoria: string) => {
        if (!lista || lista.length === 0) return;
        
        for (const l of lista) {
            // 6. SANITIZAÇÃO NATIVA: Transforma em string com segurança caso venha undefined/null/number
            if (allowedNorm) {
                const empNome = String(l.empresa?.nome || '').toUpperCase().trim();
                if (!allowedNorm.includes(empNome)) continue;
            }

            const finalizada = Array.isArray(l.pontoDeParadas) 
                ? l.pontoDeParadas.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou)
                : false;
                
            if (finalizada) continue;

            let pi = "N/D"; 
            let ri = "N/D"; 
            let pf = "N/D"; 
            let pfn = "N/D"; 
            let li = "N/D";
            let lf = "N/D";
            
            let u = "N/D";
            let rawDate = l.veiculo?.dataHora || l.veiculo?.dataComunicacao || l.ultimaData;
            if (rawDate) u = String(rawDate);
            
            let diffMinutosSaida = 0; 
            let saiu = false;
            const sentidoIda = Boolean(l.sentidoIDA);

            const pontosSimplificados: any[] = []; 

            if (Array.isArray(l.pontoDeParadas)) {
                for (const p of l.pontoDeParadas) {
                    const tipo = String(p.tipoPonto?.tipo || "");
                    const indexPonto = l.pontoDeParadas.indexOf(p) + 1; 

                    pontosSimplificados.push({
                        ordem: indexPonto,
                        atendido: Boolean(p.passou)
                    });

                    if (tipo === "Inicial") {
                        if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                        if (p.horario) pi = String(p.horario);
                    }

                    if (ri === "N/D" && tipo !== "Final" && p.passou && indexPonto <= 4) {
                        if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                            saiu = true; 

                            const horaTabelaDestePonto = String(p.horario || moment().format('HH:mm')); 
                            const hojeStr = moment().format('YYYY-MM-DD');
                            const baseTime = moment.tz(`${hojeStr} ${horaTabelaDestePonto}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                            
                            let dm = 0;
                            const tdStr = String(p.tempoDiferenca);
                            if (tdStr.includes(':')) {
                                const parts = tdStr.split(':');
                                dm = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                            } else {
                                dm = parseInt(tdStr) || 0;
                            }
                            
                            if (diffMinutosSaida === 0) {
                                diffMinutosSaida = p.atrasado ? dm : -dm;
                            }

                            if (p.atrasado) baseTime.add(dm, 'minutes');
                            else baseTime.subtract(dm, 'minutes');
                            
                            const horaCalculada = baseTime.format('HH:mm');

                            if (tipo !== "Inicial" && indexPonto > 1) {
                                ri = `${horaCalculada} (Pt ${indexPonto})`;
                            } else {
                                ri = horaCalculada;
                            }
                        }
                    }

                    if (tipo === "Final") {
                        if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                        if (p.horario) pf = String(p.horario);
                    }
                }
            }

            if (pi !== "N/D" && ri !== "N/D") {
                const cleanRi = ri.split(' ')[0]; 
                const hoje = moment().format('YYYY-MM-DD');
                const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

                if (mPi.isValid() && mRi.isValid()) {
                    const diffAbsoluta = Math.abs(mRi.diff(mPi, 'minutes'));
                    if (diffAbsoluta > 40) {
                        ri = "N/D";
                        saiu = false; 
                        diffMinutosSaida = 0; 
                    }
                }
            }

            const placaLimpa = String(l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const cachedPred = predictionCache.get(placaLimpa) as any;
            
            if (cachedPred && cachedPred.horario) {
                pfn = String(cachedPred.horario);
            } 
            else if (pf !== "N/D" && saiu) {
                const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                progFimObj.add(diffMinutosSaida, 'minutes');
                pfn = progFimObj.format('HH:mm');
            }
            else if (pf !== "N/D" && !saiu) {
                 pfn = "--:--"; 
            }

            const statusApi = calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda);

            todasLinhas.push({
                id: String(l.idLinha || l.id || ''),
                e: String(l.empresa?.nome || ''),
                r: String(l.descricaoLinha || ''),
                v: String(l.veiculo?.veiculo || ''),
                s: sentidoIda ? 1 : 0, 
                pi: pi,
                ri: ri,
                pf: pf,
                li: li,
                lf: lf,
                pfn: pfn,
                u: u,
                c: categoria,
                status_api: statusApi,
                pontos: pontosSimplificados 
            });
        }
    };

    // Executa usando os arrays previamente validados e seguros
    processarGrupo(andamento, "Em andamento");
    processarGrupo(desligado, "Carro desligado");
    processarGrupo(semPonto, "Começou sem ponto");

    return { 
        todas_linhas: todasLinhas, 
        hora: horaAtualServidor 
    };
};
