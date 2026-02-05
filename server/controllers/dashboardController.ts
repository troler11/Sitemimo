import { Request, Response } from 'express';
import https from 'https';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../utils/sharedCache'; 

// Cache do Dashboard (Dados gerais da ABM) - Atualiza a cada 30 segundos
const appCache = new NodeCache({ stdTTL: 30 }); 

const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};
const TIMEZONE = 'America/Sao_Paulo';

// Configuração do Agente HTTPS
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

// --- FUNÇÃO AUXILIAR PARA CALCULAR STATUS (CORRIGIDA) ---
const calcularStatus = (
    categoria: string, 
    pi: string, 
    ri: string, 
    pf: string, 
    pfn: string, 
    horaServidor: string,
    sentidoIda: boolean // Novo parâmetro
) => {
    // 1. Carro Desligado
    if (categoria === "Carro desligado") return "DESLIGADO";

    // 2. Não Iniciou (ri é N/D)
    if (!ri || ri === "N/D") {
        if (!pi || pi === "N/D") return "INDEFINIDO";
        
        // LÓGICA CORRIGIDA (Igual ao Frontend):
        // Se Programado (pi) < Hora Atual: Já deveria ter saído -> NAO_INICIOU (Atrasado na origem)
        // Se Programado (pi) >= Hora Atual: Ainda vai sair -> DESLOCAMENTO
        return pi < horaServidor ? "NAO_INICIOU" : "DESLOCAMENTO";
    }

    // 3. Já saiu - Verificar Atraso na Saída (Origem)
    const cleanRi = ri.split(' ')[0];
    const hoje = moment().format('YYYY-MM-DD');
    
    const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

    if (mPi.isValid() && mRi.isValid()) {
        const diffMinutos = mRi.diff(mPi, 'minutes');
        if (diffMinutos > 10) return "ATRASADO"; // Saiu atrasado da origem
    }

    // 4. Verificar Atraso de Percurso (TomTom)
    // REGRA: Só verifica percurso se for SENTIDO IDA (Entrada)
    if (sentidoIda === true) { 
        if (pfn && pfn !== "N/D" && pf && pf !== "N/D") {
            const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
            
            if (mPf.isValid() && mPfn.isValid()) {
                 const diffChegada = mPfn.diff(mPf, 'minutes');
                 // Se a previsão for mais de 10 minutos maior que o programado
                 if (diffChegada > 10) return "ATRASADO_PERCURSO";
            }
        }
    }

    // Se passou por tudo e não caiu em nenhum atraso
    return "PONTUAL";
};

// Helper para parsear data
const parseDateSafe = (dateInput: any): moment.Moment | null => {
    if (!dateInput) return null;
    const cleanStr = String(dateInput).trim();
    const m = moment(cleanStr, INPUT_FORMATS); 
    return m.isValid() ? m : null;
};

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user; 
        
        const isAdmin = user.role === 'admin';
        const allowedCompanies: string[] = user.allowed_companies || [];
        const allowedNorm = allowedCompanies.map(c => c.toUpperCase().trim());

        let dashboardData = appCache.get('dashboard_main');
        
        if (!dashboardData) {
            try {
                const response = await axios.get(URL_DASHBOARD_MAIN, { 
                    headers: {
                        ...HEADERS_DASHBOARD_MAIN,
                        "Connection": "keep-alive",
                        "User-Agent": "Node.js/Dashboard"
                    }, 
                    timeout: 60000,
                    httpsAgent: httpsAgent 
                });
                dashboardData = response.data;
                appCache.set('dashboard_main', dashboardData);
            } catch (apiError: any) {
                console.error("⚠️ Falha na API Externa:", apiError.code || apiError.message);
                dashboardData = appCache.get('dashboard_main') || { 
                    linhasAndamento: [], linhasCarroDesligado: [], linhasComecaramSemPrimeiroPonto: [] 
                };
            }
        }

        const data: any = dashboardData;
        let todasLinhas: any[] = [];
        const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm'); 

        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // --- FILTROS ---
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!isAdmin) {
                    if (!allowedNorm.includes(empNome)) continue;
                }

                const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
                if (finalizada) continue;

                // --- VARIÁVEIS ---
                let pi = "N/D"; 
                let ri = "N/D"; 
                let pf = "N/D"; 
                let pfn = "N/D"; 
                let li = "N/D";
                let lf = "N/D";
                
                // Ultimo reporte
                let u = "N/D";
                let rawDate = null;
                
                if (l.veiculo && l.veiculo.dataHora) rawDate = l.veiculo.dataHora;
                else if (l.veiculo && l.veiculo.dataComunicacao) rawDate = l.veiculo.dataComunicacao;
                else rawDate = l.ultimaData;

                if (rawDate) {
                    u = String(rawDate);
                }
                
                let diffMinutosSaida = 0; 
                let saiu = false;
                const sentidoIda = l.sentidoIDA ? true : false; // Boolean explícito

                // --- EXTRAÇÃO DE PONTOS ---
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

                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // --- VALIDAÇÃO DE TOLERÂNCIA (40 min) ---
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

                // --- PREVISÃO ---
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

                // --- CALCULAR STATUS API (COM AS CORREÇÕES) ---
                const statusApi = calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor, sentidoIda);

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

        processarGrupo(data.linhasAndamento, "Em andamento");
        processarGrupo(data.linhasCarroDesligado, "Carro desligado");
        processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

        return res.json({ 
            todas_linhas: todasLinhas, 
            hora: horaAtualServidor
        });

    } catch (error) {
        console.error("Erro Dashboard:", error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};
