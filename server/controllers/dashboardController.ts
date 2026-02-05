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

// Configuração do Agente HTTPS para evitar ECONNRESET
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

// --- FUNÇÃO AUXILIAR PARA CALCULAR STATUS (NOVA) ---
const calcularStatus = (categoria: string, pi: string, ri: string, pf: string, pfn: string, horaServidor: string) => {
    // 1. Carro Desligado
    if (categoria === "Carro desligado") return "DESLIGADO";

    // 2. Não Iniciou (ri é N/D)
    if (!ri || ri === "N/D") {
        if (!pi || pi === "N/D") return "INDEFINIDO";
        
        // Se a hora programada for MENOR que a hora atual, já deveria ter saído (Deslocamento/Atraso na saída)
        // Se a hora programada for MAIOR que a hora atual, está aguardando (Não Iniciou)
        return pi < horaServidor ? "DESLOCAMENTO" : "NAO_INICIOU";
    }

    // 3. Já saiu - Verificar Atraso na Saída
    // Limpa o ri para garantir que pegamos só a hora "HH:mm" (remove " (Pt 2)")
    const cleanRi = ri.split(' ')[0];
    const hoje = moment().format('YYYY-MM-DD');
    
    const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

    if (mPi.isValid() && mRi.isValid()) {
        const diffMinutos = mRi.diff(mPi, 'minutes');
        if (diffMinutos > 10) return "ATRASADO"; // Saiu com mais de 10 min de atraso
    }

    // 4. Verificar Atraso de Percurso (TomTom) - Opcional
    // Se a previsão de chegada (pfn) for muito maior que a programada final (pf)
    if (pfn && pfn !== "N/D" && pf && pf !== "N/D") {
        const mPf = moment.tz(`${hoje} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        const mPfn = moment.tz(`${hoje} ${pfn}`, "YYYY-MM-DD HH:mm", TIMEZONE);
        
        if (mPf.isValid() && mPfn.isValid()) {
             const diffChegada = mPfn.diff(mPf, 'minutes');
             if (diffChegada > 10) return "ATRASADO_PERCURSO";
        }
    }

    return "PONTUAL";
};

// Helper para limpar data e parsear com segurança
const parseDateSafe = (dateInput: any): moment.Moment | null => {
    if (!dateInput) return null;
    const cleanStr = String(dateInput).trim();
    const m = moment(cleanStr, INPUT_FORMATS); 
    return m.isValid() ? m : null;
};

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user; 
        
        // --- LÓGICA DE SEGURANÇA ---
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
        const horaAtualServidor = moment().tz(TIMEZONE).format('HH:mm'); // Hora atual para comparações

        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // --- FILTRO DE EMPRESA ---
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (!isAdmin) {
                    if (!allowedNorm.includes(empNome)) continue;
                }

                // Filtro Finalizada
                const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
                if (finalizada) continue;

                // --- VARIÁVEIS INICIAIS ---
                let pi = "N/D"; 
                let ri = "N/D"; 
                let pf = "N/D"; 
                let pfn = "N/D"; 
                let li = "N/D";
                let lf = "N/D";
                
                // 1. LÓGICA DO ÚLTIMO REPORTE (SEM CONVERSÃO)
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

                // 2. EXTRAÇÃO DE DADOS DOS PONTOS
                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;
                        const indexPonto = l.pontoDeParadas.indexOf(p) + 1; 

                        // A. DADOS ESTÁTICOS (Ponto 1)
                        if (tipo === "Inicial") {
                            if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                            if (p.horario) pi = p.horario;
                        }

                        // B. DADOS REAIS
                        if (ri === "N/D" && tipo !== "Final" && p.passou && indexPonto <= 4) { //PUXA ATE O 4 PONTO
                            
                            // Validação de tempoDiferenca (Aceita 0)
                            if (p.tempoDiferenca !== null && p.tempoDiferenca !== undefined && p.tempoDiferenca !== "") {
                                saiu = true; // Temporariamente assume que saiu, validaremos os 10min abaixo

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

                        // C. FINAL
                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // =========================================================
                // VALIDAÇÃO DE TOLERÂNCIA DE 40 MINUTOS
                // =========================================================
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
                // =========================================================

                // 3. PREVISÃO DE CHEGADA
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

                // --- CALCULAR STATUS API (Novo!) ---
                const statusApi = calcularStatus(categoria, pi, ri, pf, pfn, horaAtualServidor);

                // Push na lista final
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
                    status_api: statusApi // <--- Campo Novo Aqui
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
