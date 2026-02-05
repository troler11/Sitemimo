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
    // 1. Carro Desligado
    if (categoria === "Carro desligado") return "DESLIGADO";

    // 2. Não Iniciou (ri é N/D ou vazio)
    if (!ri || ri === "N/D") {
        if (!pi || pi === "N/D") return "INDEFINIDO";
        
        // Se a hora programada (pi) já passou (< horaServidor), é atraso na origem (NAO_INICIOU)
        // Se a hora programada é futura (>= horaServidor), está aguardando (DESLOCAMENTO)
        return pi < horaServidor ? "NAO_INICIOU" : "DESLOCAMENTO";
    }

    // 3. Já saiu - Verificar Atraso na Saída (Origem)
    const cleanRi = ri.split(' ')[0]; // Remove "(Pt 2)" se houver
    const hoje = moment().format('YYYY-MM-DD');
    
    const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

    if (mPi.isValid() && mRi.isValid()) {
        const diffMinutos = mRi.diff(mPi, 'minutes');
        if (diffMinutos > 10) return "ATRASADO"; // Saiu com mais de 10 min de atraso
    }

    // 4. Verificar Atraso de Percurso (TomTom/Estimativa)
    // REGRA: Só verifica percurso se for SENTIDO IDA (Entrada)
    if (sentidoIda === true) { 
        if (pfn && pfn !== "N/D" && pf && pf !== "N/D" && pfn !== "--:--") {
            const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            
            if (mPf.isValid() && mPfn.isValid()) {
                 const diffChegada = mPfn.diff(mPf, 'minutes');
                 // Se a previsão de chegada for > 10 min que a tabela
                 if (diffChegada > 10) return "ATRASADO_PERCURSO";
            }
        }
    }

    // Se passou por todas as validações sem cair em erro
    return "PONTUAL";
};

// --- SERVIÇO PRINCIPAL ---
export const fetchDashboardData = async (allowedCompanies: string[] | null = null) => {
    let dashboardData = appCache.get('dashboard_main');
    
    // 1. Busca na API Externa se não estiver em cache
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
            // Retorna estrutura vazia para não quebrar a aplicação
            dashboardData = { 
                linhasAndamento: [], 
                linhasCarroDesligado: [], 
                linhasComecaramSemPrimeiroPonto: [] 
            };
        }
    }

    const data: any = dashboardData;
    let todasLinhas: LinhaOutput[] = [];
    const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm');

    // Normaliza lista de empresas permitidas (se houver restrição)
    const allowedNorm = allowedCompanies ? allowedCompanies.map(c => c.toUpperCase().trim()) : null;

    // Função interna para processar cada grupo de linhas
    const processarGrupo = (lista: any[], categoria: string) => {
        if (!lista) return;
        
        for (const l of lista) {
            // A. Filtro de Empresa
            if (allowedNorm) {
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!allowedNorm.includes(empNome)) continue;
            }

            // B. Ignorar linhas finalizadas
            const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
            if (finalizada) continue;

            // --- PROCESSAMENTO DE DADOS ---
            let pi = "N/D"; 
            let ri = "N/D"; 
            let pf = "N/D"; 
            let pfn = "N/D"; 
            let li = "N/D";
            let lf = "N/D";
            
            // Ultimo reporte
            let u = "N/D";
            let rawDate = l.veiculo?.dataHora || l.veiculo?.dataComunicacao || l.ultimaData;
            if (rawDate) u = String(rawDate);
            
            let diffMinutosSaida = 0; 
            let saiu = false;
            const sentidoIda = l.sentidoIDA ? true : false;

            // C. Loop nos Pontos de Parada
            if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                for (const p of l.pontoDeParadas) {
                    const tipo = p.tipoPonto?.tipo;
                    const indexPonto = l.pontoDeParadas.indexOf(p) + 1; 

                    // Ponto Inicial (Tabela)
                    if (tipo === "Inicial") {
                        if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                        if (p.horario) pi = p.horario;
                    }

                    // Ponto Real (Onde está ou passou)
                    // Pega até o 4º ponto para definir inicio de viagem
                    if (ri === "N/D" && tipo !== "Final" && p.passou && indexPonto <= 4) {
                        if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                            saiu = true; 

                            const horaTabelaDestePonto = p.horario || moment().format('HH:mm'); 
                            const hojeStr = moment().format('YYYY-MM-DD');
                            const baseTime = moment.tz(`${hojeStr} ${horaTabelaDestePonto}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                            
                            let dm = 0;
                            if (typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':')) {
                                const parts = p.tempoDiferenca.split(':');
                                dm = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                            } else {
                                dm = parseInt(p.tempoDiferenca);
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

                    // Ponto Final (Tabela)
                    if (tipo === "Final") {
                        if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                        if (p.horario) pf = p.horario;
                    }
                }
            }

            // D. Validação de Tolerância (Bug de GPS/Viagem errada > 40min)
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

            // E. Previsão de Chegada (Cache ou Cálculo)
            const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const cachedPred = predictionCache.get(placaLimpa) as any;
            
            if (cachedPred && cachedPred.horario) {
                pfn = cachedPred.horario;
            } 
            else if (pf !== "N/D" && saiu) {
                const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                progFimObj.add(diffMinutosSaida, 'minutes');
                pfn = progFimObj.format('HH:mm');
            }
            else if (pf !== "N/D" && !saiu) {
                 pfn = "--:--"; 
            }

            // F. Cálculo do STATUS FINAL
            const statusApi = calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda);

            // G. Montagem do Objeto
            todasLinhas.push({
                id: l.idLinha || l.id,
                e: l.empresa?.nome || '',
                r: l.descricaoLinha || '',
                v: l.veiculo?.veiculo || '',
                s: l.sentidoIDA ? 1 : 0, 
                pi: pi,
                ri: ri,
                pf: pf,
                li: li,
                lf: lf,
                pfn: pfn,
                u: u,
                c: categoria,
                status_api: statusApi 
            });
        }
    };

    // Executa para os 3 grupos da API original
    processarGrupo(data.linhasAndamento, "Em andamento");
    processarGrupo(data.linhasCarroDesligado, "Carro desligado");
    processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

    return { 
        todas_linhas: todasLinhas, 
        hora: horaAtualServidor 
    };
};
