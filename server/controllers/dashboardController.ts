import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone';
import { predictionCache } from '../utils/sharedCache'; 

const appCache = new NodeCache({ stdTTL: 30 }); 
const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};
const TIMEZONE = 'America/Sao_Paulo';

// Formatos aceitos para parsing (Brasileiro e ISO)
const INPUT_FORMATS = ["DD/MM/YYYY HH:mm:ss", "DD/MM/YYYY HH:mm", "YYYY-MM-DD HH:mm:ss", "ISO_8601"];

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
                let pi = "N/D"; 
                let ri = "N/D"; 
                let pf = "N/D"; 
                let pfn = "N/D"; 
                let li = "N/D";
                let lf = "N/D";
                
                // 1. CORREÇÃO DE DATA AQUI: Passamos os formatos aceitos explicitamente
                let u = l.ultimaData 
                    ? moment(l.ultimaData, INPUT_FORMATS).tz(TIMEZONE).format('HH:mm') 
                    : "N/D";
                
                let diffMinutosSaida = 0; 
                let saiu = false;

                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;

                        if (tipo === "Inicial") {
                            if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                            if (p.horario) pi = p.horario;
                            
                            if (p.passou && p.horario) {
                                saiu = true;
                                if (p.tempoDiferenca) {
                                    // Parseia horario base (hoje + horario)
                                    const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario}`, TIMEZONE);
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
                                // 2. CORREÇÃO DE DATA AQUI TAMBÉM
                                else if (p.dataPassouGmt3) {
                                    ri = moment(p.dataPassouGmt3, INPUT_FORMATS).tz(TIMEZONE).format('HH:mm');
                                }
                            }
                        }

                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                const placaLimpa = (l.veiculo?.veiculo || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                const cachedPred = predictionCache.get(placaLimpa) as any;
                
                if (cachedPred && cachedPred.horario) {
                    pfn = cachedPred.horario;
                } 
                else if (pf !== "N/D" && saiu) {
                    const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, TIMEZONE);
                    progFimObj.add(diffMinutosSaida, 'minutes');
                    pfn = progFimObj.format('HH:mm');
                }
                else if (pf !== "N/D" && !saiu) {
                     const progIniObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pi}`, TIMEZONE);
                     const agora = moment().tz(TIMEZONE);
                     
                     if (agora.isAfter(progIniObj)) {
                         const atrasoAteAgora = agora.diff(progIniObj, 'minutes');
                         const progFimObj = moment.tz(`${moment().format('YYYY-MM-DD')} ${pf}`, TIMEZONE);
                         progFimObj.add(atrasoAteAgora, 'minutes');
                         pfn = progFimObj.format('HH:mm');
                     } else {
                         pfn = pf;
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
