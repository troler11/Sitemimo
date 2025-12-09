import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import moment from 'moment-timezone'; // A biblioteca mágica para datas

// Cache em memória (substitui o cache de arquivo do PHP)
const appCache = new NodeCache({ stdTTL: 30 }); // 30 segundos

// URLs e Tokens
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

        // 1. Check Cache
        let dashboardData = appCache.get('dashboard_main');
        
        if (!dashboardData) {
            const response = await axios.get(URL_DASHBOARD_MAIN, { 
                headers: HEADERS_DASHBOARD_MAIN,
                timeout: 30000 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        }

        const data: any = dashboardData;
        let todasLinhas: any[] = [];
        
        // Normaliza permissões
        const allowedNorm = allowedCompanies.map(c => c.toUpperCase().trim());

        // --- FUNÇÃO DE PROCESSAMENTO (A Lógica que faltava) ---
        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // 1. Filtro de Empresa
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (allowedNorm.length > 0 && !allowedNorm.includes(empNome)) {
                    continue;
                }

                // 2. Filtro Finalizada
                // Verifica se já passou pelo ponto "Final"
                const finalizada = l.pontoDeParadas?.some((p: any) => 
                    p.tipoPonto?.tipo === "Final" && p.passou
                );
                if (finalizada) continue;

                // --- 3. CÁLCULO DE HORÁRIOS E DADOS ---
                let pi = "N/D"; // Programado Inicial
                let ri = "N/D"; // Real Inicial
                let pf = "N/D"; // Programado Final
                let li = "N/D"; // Local Inicial (Lat,Lng)
                let lf = "N/D"; // Local Final (Lat,Lng)
                let u = l.ultimaData ? moment(l.ultimaData).tz(TIMEZONE).format('HH:mm') : "N/D";

                // Varre os pontos de parada para extrair dados
                if (l.pontoDeParadas && Array.isArray(l.pontoDeParadas)) {
                    for (const p of l.pontoDeParadas) {
                        const tipo = p.tipoPonto?.tipo;

                        // -- Lógica Ponto Inicial --
                        if (tipo === "Inicial") {
                            // Guarda Coordenadas
                            if (p.latitude && p.longitude) li = `${p.latitude},${p.longitude}`;
                            
                            // Guarda Programado
                            if (p.horario) pi = p.horario;

                            // Calcula Real (Essa é a parte difícil do PHP traduzida)
                            if (p.passou && p.horario) {
                                // Se tiver "tempoDiferenca", usamos ele para calcular o real exato
                                if (p.tempoDiferenca) {
                                    const baseTime = moment.tz(`${moment().format('YYYY-MM-DD')} ${p.horario}`, TIMEZONE);
                                    
                                    // Parseia "HH:mm:ss" ou numero de minutos
                                    let diffMinutes = 0;
                                    if (typeof p.tempoDiferenca === 'string' && p.tempoDiferenca.includes(':')) {
                                        const parts = p.tempoDiferenca.split(':');
                                        diffMinutes = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                    } else {
                                        diffMinutes = parseInt(p.tempoDiferenca);
                                    }

                                    if (p.atrasado) baseTime.add(diffMinutes, 'minutes');
                                    else baseTime.subtract(diffMinutes, 'minutes');

                                    ri = baseTime.format('HH:mm');
                                } 
                                // Fallback: Se não tem diferença mas tem data GMT3
                                else if (p.dataPassouGmt3) {
                                    ri = moment(p.dataPassouGmt3).tz(TIMEZONE).format('HH:mm');
                                }
                            }
                        }

                        // -- Lógica Ponto Final --
                        if (tipo === "Final") {
                            if (p.latitude && p.longitude) lf = `${p.latitude},${p.longitude}`;
                            if (p.horario) pf = p.horario;
                        }
                    }
                }

                // 4. Monta Objeto Otimizado (Igual ao PHP Dashboard.php)
                todasLinhas.push({
                    id: l.idLinha || l.id,
                    e: l.empresa?.nome || '', // Empresa
                    r: l.descricaoLinha || '', // Rota
                    v: l.veiculo?.veiculo || '', // Veículo
                    s: l.sentidoIda ? 1 : 0, // Sentido
                    pi: pi,
                    ri: ri,
                    pf: pf,
                    li: li,
                    lf: lf,
                    u: u,
                    c: categoria
                });
            }
        };

        processarGrupo(data.linhasAndamento, "Em andamento");
        processarGrupo(data.linhasCarroDesligado, "Carro desligado");
        processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

        // Retorna JSON para o React
        return res.json({ 
            todas_linhas: todasLinhas, 
            hora: moment().tz(TIMEZONE).format('HH:mm') 
        });

    } catch (error) {
        console.error("Erro Dashboard:", error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};
