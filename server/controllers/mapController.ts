import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import { simplificarRota } from '../utils/geometry'; // Certifique-se que existe ou remova se não usar
import { predictionCache } from '../utils/sharedCache'; 
import moment from 'moment-timezone';

const apiCache = new NodeCache({ stdTTL: 60 });

const TOMTOM_KEYS = (process.env.TOMTOM_KEYS || "").split(",");
const URL_DASHBOARD = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const headersAbm = {
    "Accept": "application/json",
    "Authorization": process.env.TOKEN_ABMBUS || "",
    "User-Agent": "MimoBusBot/2.0"
};

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

const getVeiculoPosicao = async (placa: string) => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/g, '');
    try {
        const res = await axios.get(`${URL_RENDER_WORKER}?placa=${cleanPlaca}`, {
            timeout: 25000,
            headers: { "X-Render-Token": RENDER_TOKEN }
        });
        if (!res.data || !res.data[0]) throw new Error("Veículo não localizado");
        return res.data[0];
    } catch (error: any) {
        throw new Error(error.response?.data?.erro || "Erro ao comunicar com rastreador");
    }
};

const getDashboardData = async () => {
    const cached = apiCache.get('dashboard_full');
    if (cached) return cached;
    const res = await axios.get(URL_DASHBOARD, { headers: headersAbm, timeout: 10000 });
    apiCache.set('dashboard_full', res.data);
    return res.data;
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
    throw new Error("Falha no serviço de roteamento (TomTom)");
};

export const calculateRoute = async (req: Request, res: Response) => {
    try {
        const { placa, tipo } = req.params; 
        const idLinhaQuery = req.query.idLinha as string;
        const cleanPlaca = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();

        // 1. Posição Atual
        const veiculoData = await getVeiculoPosicao(cleanPlaca);
        let latAtual = parseFloat(veiculoData.latitude || veiculoData.loc?.[0] || 0);
        let lngAtual = parseFloat(veiculoData.longitude || veiculoData.loc?.[1] || 0);
        
        if (!latAtual && typeof veiculoData.loc === 'string') {
            const parts = veiculoData.loc.split(',');
            latAtual = parseFloat(parts[0]);
            lngAtual = parseFloat(parts[1]);
        }

        if (!latAtual || !lngAtual) return res.status(422).json({ message: "Coordenadas inválidas" });

        // 2. Achar Linha
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

        if (!linhaAlvo) return res.status(404).json({ message: "Linha não encontrada" });

        const idLinhaOficial = linhaAlvo.idLinha || linhaAlvo.id;
        const idVeiculoMongo = linhaAlvo.veiculo?.id;

        // 3. Busca Paralela (Rota Oficial e Histórico Real)
        const [resProg, resExec] = await Promise.all([
            axios.get(`https://abmbus.com.br:8181/api/linha/${idLinhaOficial}`, { headers: headersAbm }).catch(() => ({ data: { desenhoRota: [] } })),
            idVeiculoMongo ? axios.get(`https://abmbus.com.br:8181/api/rota/temporealmongo/${idVeiculoMongo}?idLinha=${idLinhaOficial}`, { headers: headersAbm }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        // 4. Geometria Básica
        let rastroOficial = (resProg.data.desenhoRota || []).map((p: any) => [parseFloat(p.latitude || p.lat), parseFloat(p.longitude || p.lng)]);
        const rawExec = Array.isArray(resExec.data) ? (resExec.data[0]?.logRotaDiarias || []) : [];
        let rastroExecutado = rawExec.map((p: any) => [parseFloat(p.latitude), parseFloat(p.longitude)]);

        const paradas = linhaAlvo.pontoDeParadas || [];
        const pontosMapa = paradas.map((p: any) => ({
            lat: parseFloat(p.latitude),
            lng: parseFloat(p.longitude),
            passou: p.passou || false,
            nome: p.descricao || 'Ponto'
        })).filter((p: any) => p.lat && p.lng);

        const destinoFinal = tipo === 'inicial' ? pontosMapa[0] : pontosMapa[pontosMapa.length - 1];
        
        // --- OTIMIZAÇÃO: SE FOR ROTA FINAL, RETORNA JÁ (SEM TOMTOM) ---
        if (tipo === 'final') {
            return res.json({
                tempo: "---",
                distancia: "---",
                duracaoSegundos: 0,
                previsao_chegada: "N/D", // O Frontend já tem o 'pf' que vem da tabela
                origem_endereco: veiculoData.endereco || `Lat: ${latAtual.toFixed(4)}, Lng: ${lngAtual.toFixed(4)}`,
                destino_endereco: destinoFinal ? destinoFinal.nome : "Final",
                veiculo_pos: [latAtual, lngAtual],
                rastro_oficial: simplificarRota(rastroOficial), 
                rastro_real: simplificarRota(rastroExecutado),
                rastro_tomtom: [], // <--- ARRAY VAZIO (Economia de API e Performance)
                todos_pontos_visual: pontosMapa 
            });
        }

        // =================================================================================
        // DAQUI PARA BAIXO, SÓ EXECUTA SE FOR TIPO "INICIAL" (ENTRADA/PREVISÃO)
        // =================================================================================

        if (!destinoFinal) return res.status(400).json({ message: "Sem paradas definidas" });

        // Filtro Inteligente de Waypoints (Pontos à frente)
        let waypointsTomTom: any[] = [];
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
        
        const waypointsEnvio = waypointsTomTom.slice(0, 15); // Limite da API TomTom
        let coordsString = `${latAtual},${lngAtual}`; 
        
        // CORREÇÃO TS: Tipagem explícita no p
        waypointsEnvio.forEach((p: any) => { coordsString += `:${p.lat},${p.lng}`; });

        const ultimoWP = waypointsEnvio[waypointsEnvio.length - 1];
        if (!ultimoWP || (ultimoWP.lat !== destinoFinal.lat)) {
            coordsString += `:${destinoFinal.lat},${destinoFinal.lng}`;
        }

        // 5. Chamada TomTom (Apenas para 'inicial')
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
        
        // Fallback se TomTom não retornar pontos (linha reta)
        if (rastroTomTom.length === 0) {
            // CORREÇÃO TS: Tipagem explícita no p
            rastroTomTom = [[latAtual, lngAtual], ...waypointsEnvio.map((p: any) => [p.lat, p.lng])];
        }

        const agora = moment().tz('America/Sao_Paulo');
        const chegadaEstimada = agora.clone().add(segundos, 'seconds');
        const horarioChegadaFmt = chegadaEstimada.format('HH:mm');

        // Salva cache da previsão para usar na tabela principal
        predictionCache.set(cleanPlaca, { horario: horarioChegadaFmt, timestamp: Date.now() });

        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const tempoTxt = horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`;

        return res.json({
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
        });

    } catch (error: any) {
        console.error("Erro Rota:", error.message);
        return res.status(500).json({ message: error.message || "Erro interno ao calcular rota" });
    }
};
