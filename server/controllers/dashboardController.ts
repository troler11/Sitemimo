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
        
        // --- LÓGICA DE SEGURANÇA CORRIGIDA ---
        const isAdmin = user.role === 'admin';
        
        // Normaliza as empresas permitidas (se houver)
        const allowedCompanies: string[] = user.allowed_companies || [];
        const allowedNorm = allowedCompanies.map(c => c.toUpperCase().trim());
        // -------------------------------------

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

        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // --- FILTRO DE EMPRESA (LÓGICA MESTRA) ---
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                
                // Se NÃO for Admin, aplica a checagem rigorosa
                if (!isAdmin) {
                    // Se a empresa da linha não estiver na lista permitida do usuário, PULA.
                    // Isso também resolve o caso de lista vazia: .includes retorna false e bloqueia.
                    if (!allowedNorm.includes(empNome)) continue;
                }
                // Se for Admin, passa direto aqui.
                // -----------------------------------------

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
                if (mReporte) u = mReporte.tz(TIMEZONE).format('HH:mm');
                
                // Variáveis de Saída
                let diffMinutosSaida = 0; 
                let saiu = false;

                // 2. EXTRAÇÃO DE DADOS DOS PONTOS
                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;

                        // --- A. DEFINIÇÃO DE DADOS ESTÁTICOS (TABELA) ---
                        // O Programado Início (PI) e Local Inicial (LI) sempre vêm do ponto marcado como "Inicial"
                        if (tipo === "Inicial") {
                            if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                            if (p.horario) pi = p.horario;
                        }

                        // --- B. DEFINIÇÃO DE DADOS REAIS (DINÂMICO) ---
                        // Busca o PRIMEIRO ponto onde o ônibus passou para definir o "Real Início".
                        // Se pulou o ponto 1, ele pega o ponto 2, e assim por diante.
                        // A verificação (ri === "N/D") garante que pegamos apenas o primeiro registro válido.
                        if (ri === "N/D" && tipo !== "Final" && p.passou) {
                            saiu = true; // Marca que o ônibus está em viagem

                            // Estratégia 1: Cálculo via Diferença (Mais preciso)
                            if (p.tempoDiferenca) {
                                // Se o ponto não tiver horário (raro), usa o horário atual como base, senão usa o da tabela
                                const horaBaseStr = p.horario || moment().format('HH:mm'); 
                                const hojeStr = moment().format('YYYY-MM-DD');
                                const baseTime = moment.tz(`${hojeStr} ${horaBaseStr}`, "YYYY-MM-DD HH:mm", TIMEZONE);
                                
                                let dm = 0;
                                if (typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':')) {
                                    const parts = p.tempoDiferenca.split(':');
                                    dm = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                } else {
                                    dm = parseInt(p.tempoDiferenca);
                                }
                                
                                // Se for o Ponto Inicial, calculamos o atraso de saída.
                                // Se for Ponto 2 ou 3, apenas registramos o horário que ele passou ali.
                                if (tipo === "Inicial") {
                                    diffMinutosSaida = p.atrasado ? dm : -dm;
                                }

                                if (p.atrasado) baseTime.add(dm, 'minutes');
                                else baseTime.subtract(dm, 'minutes');
                                
                                ri = baseTime.format('HH:mm');
                            } 
                            // Estratégia 2: Data Exata do Evento (GPS)
                            else if (p.dataPassouGmt3) {
                                const mPassou = parseDateSafe(p.dataPassouGmt3);
                                if (mPassou) ri = mPassou.tz(TIMEZONE).format('HH:mm');
                            }
                        }

                        // --- C. DEFINIÇÃO DO FINAL ---
                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // 3. LÓGICA DE PREVISÃO DE CHEGADA
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
