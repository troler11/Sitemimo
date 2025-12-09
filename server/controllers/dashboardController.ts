import { Request, Response } from 'express';
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

// Formatos de data aceitos (Prioridade para o Brasileiro)
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
        const allowedCompanies: string[] = user.role === 'admin' ? [] : user.allowed_companies;

        let dashboardData = appCache.get('dashboard_main');
        if (!dashboardData) {
            const response = await axios.get(URL_DASHBOARD_MAIN, { 
                headers: HEADERS_DASHBOARD_MAIN, timeout: 30000 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        }

        const data: any = dashboardData;
        let todasLinhas: any[] = [];
        const allowedNorm = allowedCompanies.map(c => c.toUpperCase().trim());

        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // Filtro Empresa
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (allowedNorm.length > 0 && !allowedNorm.includes(empNome)) continue;

                // Filtro Finalizada
                const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
                if (finalizada) continue;

                // --- VARIÁVEIS INICIAIS ---
                let pi = "N/D"; // Prog. Início
                let ri = "N/D"; // Real Início
                let pf = "N/D"; // Prog. Fim
                let pfn = "N/D"; // Prev. Fim (Calculado)
                let li = "N/D";
                let lf = "N/D";
                
                // 1. LÓGICA DO ÚLTIMO REPORTE (GPS Real)
                let u = "N/D";
                let rawDate = null;
                // Prioridade: dataHora (GPS) > dataComunicacao > ultimaData
                if (l.veiculo && l.veiculo.dataHora) rawDate = l.veiculo.dataHora;
                else if (l.veiculo && l.veiculo.dataComunicacao) rawDate = l.veiculo.dataComunicacao;
                else rawDate = l.ultimaData;

                const mReporte = parseDateSafe(rawDate);
                if (mReporte) u = mReporte.tz(TIMEZONE).format('HH:mm');
                
                // Variáveis de Saída
                let diffMinutosSaida = 0; 
                let saiu = false;

                // 2. EXTRAÇÃO DE DADOS DOS PONTOS
                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;

                        if (tipo === "Inicial") {
                            if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                            if (p.horario) pi = p.horario;
                            
                            if (p.passou && p.horario) {
                                saiu = true;
                                if (p.tempoDiferenca) {
                                    // Cálculo seguro do Real Início
                                    const hojeStr = moment().format('YYYY-MM-DD');
                                    const baseTime = moment.tz(`${hojeStr} ${p.horario}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                                    
                                    let dm = 0;
                                    if (typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':')) {
                                        const parts = p.tempoDiferenca.split(':');
                                        dm = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                    } else {
                                        dm = parseInt(p.tempoDiferenca);
                                    }
                                    
                                    diffMinutosSaida = p.atrasado ? dm : -dm;

                                    if (p.atrasado) baseTime.add(dm, 'minutes');
                                    else baseTime.subtract(dm, 'minutes');
                                    ri = baseTime.format('HH:mm');
                                } 
                                else if (p.dataPassouGmt3) {
                                    const mPassou = parseDateSafe(p.dataPassouGmt3);
                                    if (mPassou) ri = mPassou.tz(TIMEZONE).format('HH:mm');
                                }
                            }
                        }

                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // 3. LÓGICA DE PREVISÃO DE CHEGADA (Prev. Fim)
                const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                
                // (A) Cache da TomTom (Validade 5 Minutos)
                // Se você clicou no botão há menos de 5 min, usa esse valor preciso.
                const cachedPred = predictionCache.get(placaLimpa) as any;
                
                if (cachedPred && cachedPred.horario) {
                    pfn = cachedPred.horario;
                } 
                // (B) Se JÁ SAIU e sem cache: Projeta o atraso da saída na chegada
                else if (pf !== "N/D" && saiu) {
                    const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                    progFimObj.add(diffMinutosSaida, 'minutes');
                    pfn = progFimObj.format('HH:mm');
                }
                // (C) Se NÃO SAIU: Retorna traços (Não calcula previsão)
                else if (pf !== "N/D" && !saiu) {
                     pfn = "--:--"; 
                }

                todasLinhas.push({
                    id: l.idLinha || l.id,
                    e: l.empresa?.nome || '',
                    r: l.descricaoLinha || '',
                    v: l.veiculo?.veiculo || '',
                    s: l.sentidoIda ? 1 : 0,
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
