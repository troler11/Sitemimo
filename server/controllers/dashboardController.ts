import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../utils/sharedCache'; // <--- IMPORTAR O CACHE

const appCache = new NodeCache({ stdTTL: 30 });
const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};
const TIMEZONE = 'America/Sao_Paulo';

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
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (allowedNorm.length > 0 && !allowedNorm.includes(empNome)) continue;

                const finalizada = l.pontoDeParadas?.some((p: any) => p.tipoPonto?.tipo === "Final" && p.passou);
                if (finalizada) continue;

                // --- VARIÁVEIS BASE ---
                let pi = "N/D"; // Prog Inicio
                let ri = "N/D"; // Real Inicio
                let pf = "N/D"; // Prog Fim
                let pfn = "N/D"; // Previsão Fim Nova (Calculada)
                let u = l.ultimaData ? moment(l.ultimaData).tz(TIMEZONE).format('HH:mm') : "N/D";
                
                // Dados para cálculo de atraso
                let diffMinutosSaida = 0; 
                let saiu = false;

                // Varredura dos pontos
                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;

                        if (tipo === "Inicial") {
                            if (p.horario) pi = p.horario;
                            
                            if (p.passou && p.horario) {
                                saiu = true;
                                // Lógica de Real Início (ri)
                                if (p.tempoDiferenca) {
                                    const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario}`, TIMEZONE);
                                    let dm = 0;
                                    if (typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':')) {
                                        const parts = p.tempoDiferenca.split(':');
                                        dm = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                    } else {
                                        dm = parseInt(p.tempoDiferenca);
                                    }
                                    
                                    // Guarda a diferença para projetar no final
                                    diffMinutosSaida = p.atrasado ? dm : -dm;

                                    if (p.atrasado) baseTime.add(dm, 'minutes');
                                    else baseTime.subtract(dm, 'minutes');
                                    ri = baseTime.format('HH:mm');
                                } else if (p.dataPassouGmt3) {
                                    ri = moment(p.dataPassouGmt3).tz(TIMEZONE).format('HH:mm');
                                }
                            }
                        }

                        if (tipo === "Final") {
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // --- LÓGICA DE PREVISÃO DE TÉRMINO (Prev. Fim) ---
                const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                
                // 1. Tenta pegar do Cache (TomTom) - Prioridade Máxima
                const cachedPred = predictionCache.get(placaLimpa) as any;
                
                if (cachedPred && cachedPred.horario) {
                    pfn = cachedPred.horario; // Valor exato do GPS/TomTom
                } 
                // 2. Se não tem cache, projeta o atraso da saída (Lógica Original)
                else if (pf !== "N/D" && saiu) {
                    // Pega o horário programado de chegada
                    const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, TIMEZONE);
                    
                    // Aplica a mesma diferença da saída
                    progFimObj.add(diffMinutosSaida, 'minutes');
                    
                    pfn = progFimObj.format('HH:mm');
                }
                // 3. Se não saiu ainda, a previsão é o próprio programado (ou atrasado pelo tempo atual)
                else if (pf !== "N/D" && !saiu) {
                     // Se já passou do horário de saída, empurramos a previsão
                     const progIniObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pi}`, TIMEZONE);
                     const agora = moment().tz(TIMEZONE);
                     
                     if (agora.isAfter(progIniObj)) {
                         const atrasoAteAgora = agora.diff(progIniObj, 'minutes');
                         const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, TIMEZONE);
                         progFimObj.add(atrasoAteAgora, 'minutes');
                         pfn = progFimObj.format('HH:mm');
                     } else {
                         pfn = pf; // Está no horário, previsão é a original
                     }
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
                    pfn: pfn, // <--- CAMPO NOVO: Previsão Fim Nova
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
