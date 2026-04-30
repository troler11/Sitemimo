import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import { calcularDistanciaRapida, simplificarRota } from '../utils/geometry';
import { predictionCache } from '../utils/sharedCache'; 
import moment from 'moment-timezone';
import { z } from 'zod'; // Importação do Zod para segurança

const apiCache = new NodeCache({ stdTTL: 60 });

const TOMTOM_KEYS = (process.env.TOMTOM_KEYS || "").split(",");
const URL_DASHBOARD = process.env.URL_DASHBOARD || "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const headersAbm = {
    "Accept": "application/json",
    "Authorization": process.env.TOKEN_ABMBUS || "",
    "User-Agent": "MimoBusBot/2.0"
};

// ==========================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// ==========================================
// Garante que a placa seja limpa e os parâmetros de URL sejam exatamente o esperado
const rotaParamsSchema = z.object({
    placa: z.string().transform(val => val.replace(/[^A-Z0-9]/g, '').toUpperCase()),
    tipo: z.string().optional().default('final')
});

const rotaQuerySchema = z.object({
    idLinha: z.string().optional()
});

// --- FUNÇÃO HAVERSINE (Cálculo de Distância em KM) ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}
// -----------------------------------------------------

const getVeiculoPosicao = async (placa: string) => {
    try {
        const res = await axios.get(`${URL_RENDER_WORKER}?placa=${placa}`, {
            timeout: 25000,
            headers: { "X-Render-Token": RENDER_TOKEN }
        });
        if (!res.data || !res.data[0]) throw new Error("VEICULO_NAO_LOCALIZADO");
        return res.data[0];
    } catch (error: any) {
        // Lança um erro padronizado para não vazar a URL do worker
        throw new Error(error.message === "VEICULO_NAO_LOCALIZADO" ? error.message : "ERRO_COMUNICACAO_RASTREADOR");
    }
};

const getDashboardData = async () => {
    const cached = apiCache.get('dashboard_full');
    if (cached) return cached;
    try {
        const res = await axios.get(URL_DASHBOARD, { headers: headersAbm, timeout: 10000 });
        apiCache.set('dashboard_full', res.data);
        return res.data;
    } catch (error) {
        throw new Error("ERRO_ABMBUS");
    }
};

const calculateTomTomRoute = async (coordsString: string) => {
    const keys = [...TOMTOM_KEYS].sort(() => 0.5 - Math.random());
    for (const key of keys) {
        try {
            const url = `https://api.tomtom.com/routing/1/calculateRoute/${coordsString}/json?key=${key}&traffic=true&travelMode=bus`;
            const res = await axios.get(url, { timeout: 4000 });
            return res.data;
        } catch (e) { continue; }
    }
    throw new Error("FALHA_TOMTOM");
};

export const calculateRoute = async (req: Request, res: Response) => {
    try {
        // 1. AUTENTICAÇÃO BÁSICA (Garante que curiosos na internet não acessem)
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ message: "Sessão inválida. Faça login para acessar o rastreamento." });
        }

        // 2. VALIDAÇÃO ZOD (Sanitização rígida de entradas)
        const params = rotaParamsSchema.parse(req.params);
        const query = rotaQuerySchema.parse(req.query);
        
        const cleanPlaca = params.placa;
        const tipo = params.tipo;
        const idLinhaQuery = query.idLinha;

        // --- 3. BLOCO DE ECONOMIA (CACHE) ---
        const cacheKey = `rota_${cleanPlaca}_${tipo}`; 
        const cachedRoute = predictionCache.get(cacheKey) as any;

        if (cachedRoute && (Date.now() - cachedRoute.timestamp < 60000)) {
            console.log(`[CACHE] Usando rota salva para ${cleanPlaca}`);
            return res.json(cachedRoute.data);
        }

        // 4. Posição Atual
        const veiculoData = await getVeiculoPosicao(cleanPlaca);
        let latAtual = parseFloat(veiculoData.latitude || veiculoData.loc?.[0] || 0);
        let lngAtual = parseFloat(veiculoData.longitude || veiculoData.loc?.[1] || 0);
        
        if (!latAtual && typeof veiculoData.loc === 'string') {
            const parts = veiculoData.loc.split(',');
            latAtual = parseFloat(parts[0]);
            lngAtual = parseFloat(parts[1]);
        }

        if (isNaN(latAtual) || isNaN(lngAtual) || latAtual === 0) {
            return res.status(422).json({ message: "As coordenadas do veículo são inválidas ou estão indisponíveis." });
        }

        // 5. Achar Linha
        const dashData: any = await getDashboardData();
        const listas = [dashData.linhasAndamento, dashData.linhasCarroDesligado, dashData.linhasComecaramSemPrimeiroPonto];
        let linhaAlvo: any = null;

        outerLoop:
        for (const lista of listas) {
            if (!lista) continue;
            for (const l of lista) {
                const vPlaca = (l.veiculo?.veiculo || l.placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                const vId = String(l.idLinha || l.id);
                if (vPlaca === cleanPlaca) {
                    if (idLinhaQuery && vId !== idLinhaQuery) continue; 
                    linhaAlvo = l;
                    break outerLoop;
                }
            }
        }

        if (!linhaAlvo) return res.status(404).json({ message: "Linha de operação não encontrada para este veículo." });

        // SEGURANÇA AVANÇADA (Opcional): Se a linhaAlvo possuir o nome do cliente (ex: linhaAlvo.cliente), 
        // você pode bloquear se user.role !== 'admin' e user.allowed_companies não incluir esse cliente.

        const idLinhaOficial = linhaAlvo.idLinha || linhaAlvo.id;
        const idVeiculoMongo = linhaAlvo.veiculo?.id;

        // 6. Busca Paralela Segura (Captura erros sem quebrar a execução)
        const [resProg, resExec] = await Promise.all([
            axios.get(`https://abmbus.com.br:8181/api/linha/${idLinhaOficial}`, { headers: headersAbm }).catch(() => ({ data: { desenhoRota: [] } })),
            idVeiculoMongo ? axios.get(`https://abmbus.com.br:8181/api/rota/temporealmongo/${idVeiculoMongo}?idLinha=${idLinhaOficial}`, { headers: headersAbm }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        // 7. Geometria
        let rastroOficial = (resProg.data.desenhoRota || []).map((p: any) => [parseFloat(p.latitude || p.lat), parseFloat(p.longitude || p.lng)]);
        let rastroExecutado = [];
        const rawExec = Array.isArray(resExec.data) ? (resExec.data[0]?.logRotaDiarias || []) : [];
        rastroExecutado = rawExec.map((p: any) => [parseFloat(p.latitude), parseFloat(p.longitude)]);

        const paradas = linhaAlvo.pontoDeParadas || [];
        const pontosMapa = paradas.map((p: any) => ({
            lat: parseFloat(p.latitude),
            lng: parseFloat(p.longitude),
            passou: p.passou || false,
            nome: p.descricao || 'Ponto'
        })).filter((p: any) => p.lat && p.lng);

        const destinoFinal = tipo === 'inicial' ? pontosMapa[0] : pontosMapa[pontosMapa.length - 1];
        if (!destinoFinal) return res.status(400).json({ message: "A rota selecionada não possui paradas geolocalizadas definidas." });

        // Filtro Inteligente
        let waypointsTomTom: any[] = [];
        if (tipo !== 'inicial') {
            const pontosPendentes = pontosMapa.filter((p: any) => !p.passou);

            if (pontosPendentes.length > 0) {
                let indexMaisProximo = 0;
                let menorDistancia = Infinity;

                pontosPendentes.forEach((p: any, index: number) => {
                    const dist = getDistanceFromLatLonInKm(latAtual, lngAtual, p.lat, p.lng);
                    if (dist < menorDistancia) {
                        menorDistancia = dist;
                        indexMaisProximo = index;
                    }
                });
                waypointsTomTom = pontosPendentes.slice(indexMaisProximo);
            }
        }
        
        const waypointsEnvio = waypointsTomTom.slice(0, 15);
        let coordsString = `${latAtual},${lngAtual}`; 
        
        waypointsEnvio.forEach((p: any) => { coordsString += `:${p.lat},${p.lng}`; });

        const ultimoWP = waypointsEnvio[waypointsEnvio.length - 1];
        if (!ultimoWP || (ultimoWP.lat !== destinoFinal.lat)) {
            coordsString += `:${destinoFinal.lat},${destinoFinal.lng}`;
        }

        // 8. TomTom
        const tomTomData = await calculateTomTomRoute(coordsString);
        const route = tomTomData.routes?.[0];
        const summary = route?.summary || { travelTimeInSeconds: 0, lengthInMeters: 0 };
        const segundos = summary.travelTimeInSeconds;
        const metros = summary.lengthInMeters;

        let rastroTomTom: number[][] = [];
        if (route && route.legs) {
            route.legs.forEach((leg: any) => {
                if (leg.points) {
                    leg.points.forEach((pt: any) => {
                        rastroTomTom.push([pt.latitude, pt.longitude]);
                    });
                }
            });
        }
        if (rastroTomTom.length === 0) {
            rastroTomTom = [[latAtual, lngAtual], ...waypointsEnvio.map((p: any) => [p.lat, p.lng])];
        }

        const agora = moment().tz('America/Sao_Paulo');
        const chegadaEstimada = agora.clone().add(segundos, 'seconds');
        const horarioChegadaFmt = chegadaEstimada.format('HH:mm');

        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const tempoTxt = horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`;

        // 9. Objeto de resposta final
        const responseData = {
            tempo: tempoTxt,
            distancia: (metros / 1000).toFixed(2) + " km",
            duracaoSegundos: segundos,
            previsao_chegada: horarioChegadaFmt,
            origem_endereco: veiculoData.endereco || `Lat: ${latAtual.toFixed(4)}, Lng: ${lngAtual.toFixed(4)}`,
            destino_endereco: destinoFinal.nome,
            veiculo_pos: [latAtual, lngAtual],
            rastro_oficial: simplificarRota(rastroOficial), 
            rastro_real: simplificarRota(rastroExecutado),
            rastro_tomtom: simplificarRota(rastroTomTom), 
            todos_pontos_visual: pontosMapa 
        };

        // Salvar Cache
        predictionCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        predictionCache.set(cleanPlaca, { horario: horarioChegadaFmt, timestamp: Date.now() });

        return res.json(responseData);

    } catch (error: any) {
        // TRATAMENTO DE ERROS SEGURO (Impede o vazamento de stack traces e dados internos)
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: "Parâmetros de rastreamento inválidos." });
        }
        
        console.error("🚨 Erro Rota (Oculto do Frontend):", error.message);
        
        // Mapeia mensagens genéricas e seguras para os usuários com base nos erros que nós disparamos
        if (error.message === "VEICULO_NAO_LOCALIZADO") {
            return res.status(404).json({ message: "Veículo não localizado na frota atual." });
        }
        if (error.message === "ERRO_COMUNICACAO_RASTREADOR") {
            return res.status(503).json({ message: "Serviço de GPS temporariamente indisponível." });
        }
        if (error.message === "ERRO_ABMBUS" || error.message === "FALHA_TOMTOM") {
            return res.status(503).json({ message: "Serviço de roteamento externo indisponível no momento." });
        }

        return res.status(500).json({ message: "Ocorreu um erro interno ao processar a rota. Tente novamente em instantes." });
    }
};
