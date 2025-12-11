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
                
                // 1. LÓGICA DO ÚLTIMO REPORTE (GPS Real)
                let u = "N/D";
                let rawDate = null;
                if (l.veiculo && l.veiculo.dataHora) rawDate = l.veiculo.dataHora;
                else if (l.veiculo && l.veiculo.dataComunicacao) rawDate = l.veiculo.dataComunicacao;
                else rawDate = l.ultimaData;

                const mReporte = parseDateSafe(rawDate);
                if (mReporte) u = mReporte.tz(TIMEZONE).format('DD/MM/YYYY HH:mm');
                
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
                        if (ri === "N/D" && tipo !== "Final" && p.passou && indexPonto <= 4) {
                            
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
                // VALIDAÇÃO DE TOLERÂNCIA DE 10 MINUTOS (NOVA REGRA)
                // =========================================================
                if (pi !== "N/D" && ri !== "N/D") {
                    // Limpa o texto "(Pt 2)" para pegar só a hora "14:30"
                    const cleanRi = ri.split(' ')[0]; 
                    
                    const hoje = moment().format('YYYY-MM-DD');
                    const mPi = moment.tz(`${hoje} ${pi}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                    const mRi = moment.tz(`${hoje} ${cleanRi}`, "YYYY-MM-DD HH:mm", TIMEZONE);

                    if (mPi.isValid() && mRi.isValid()) {
                        const diffAbsoluta = Math.abs(mRi.diff(mPi, 'minutes'));

                        // Se a diferença for maior que 10 minutos, considera que não é a viagem correta
                        if (diffAbsoluta > 40) {
                            ri = "N/D";
                            saiu = false; // Cancela status de saída
                            diffMinutosSaida = 0; // Zera diferença para não afetar previsão
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
                    c: categoria
                });
            }
        };

        processarGrupo(data.linhasAndamento, "Em andamento");
        processarGrupo(data.linhasCarroDesligado, "Carro desligado");
        processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

        return res.json({ 
            todas_linhas: todasLinhas, 
            hora: moment().tz(TIMEZONE).format('HH:mm') 
        });

    } catch (error) {
        console.error("Erro Dashboard:", error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};
