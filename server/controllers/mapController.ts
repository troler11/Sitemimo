import { Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import { calcularDistanciaRapida, simplificarRota } from '../utils/geometry';

// Cache para evitar spam na API da ABM (Dashboard)
const apiCache = new NodeCache({ stdTTL: 60 });

// Configurações
const TOMTOM_KEYS = (process.env.TOMTOM_KEYS || "").split(",");
const URL_DASHBOARD = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const URL_RENDER_WORKER = process.env.URL_WORKER_RENDER || "https://testeservidor-wg1g.onrender.com";
const RENDER_TOKEN = process.env.RENDER_TOKEN || "teste";

const headersAbm = {
    "Accept": "application/json",
    "Authorization": process.env.TOKEN_ABMBUS || "",
    "User-Agent": "MimoBusBot/2.0"
};

// --- FUNÇÕES AUXILIARES ---

// 1. Busca Posição Atual (Render Worker)
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

// 2. Busca Dados Dashboard (Para achar a linha correta)
const getDashboardData = async () => {
    const cached = apiCache.get('dashboard_full');
    if (cached) return cached;

    const res = await axios.get(URL_DASHBOARD, { headers: headersAbm, timeout: 10000 });
    apiCache.set('dashboard_full', res.data);
    return res.data;
};

// 3. TomTom com Rotação de Chaves
const calculateTomTomRoute = async (coordsString: string) => {
    // Tenta chaves aleatórias até funcionar
    const keys = [...TOMTOM_KEYS].sort(() => 0.5 - Math.random());
    
    for (const key of keys) {
        try {
            const url = `https://api.tomtom.com/routing/1/calculateRoute/${coordsString}/json?key=${key}&traffic=true&travelMode=bus`;
            const res = await axios.get(url, { timeout: 4000 });
            return res.data;
        } catch (e) {
            continue; // Tenta próxima chave
        }
    }
    throw new Error("Falha no serviço de roteamento (TomTom)");
};

// --- HANDLER PRINCIPAL ---

export const calculateRoute = async (req: Request, res: Response) => {
    try {
        const { placa, tipo } = req.params; // tipo: 'inicial' ou 'final'
        const idLinhaQuery = req.query.idLinha as string;
        const cleanPlaca = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();

        // 1. Posição Atual (Render)
        const veiculoData = await getVeiculoPosicao(cleanPlaca);
        
        let latAtual = parseFloat(veiculoData.latitude || veiculoData.loc?.[0] || 0);
        let lngAtual = parseFloat(veiculoData.longitude || veiculoData.loc?.[1] || 0);
        
        // Correção se vier string 'lat,lng'
        if (!latAtual && typeof veiculoData.loc === 'string') {
            const parts = veiculoData.loc.split(',');
            latAtual = parseFloat(parts[0]);
            lngAtual = parseFloat(parts[1]);
        }

        if (!latAtual || !lngAtual) return res.status(422).json({ message: "Coordenadas inválidas" });

        // 2. Achar a Linha nos dados do Dashboard
        const dashData: any = await getDashboardData();
        const listas = [
            dashData.linhasAndamento, 
            dashData.linhasCarroDesligado, 
            dashData.linhasComecaramSemPrimeiroPonto
        ];

        let linhaAlvo: any = null;

        // Lógica de Busca Estrita (Placa + ID Linha)
        outerLoop:
        for (const lista of listas) {
            if (!lista) continue;
            for (const l of lista) {
                const vPlaca = (l.veiculo?.veiculo || l.placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                const vId = String(l.idLinha || l.id);

                if (vPlaca === cleanPlaca) {
                    if (idLinhaQuery && vId !== idLinhaQuery) continue; // ID não bate
                    linhaAlvo = l;
                    break outerLoop;
                }
            }
        }

        if (!linhaAlvo) return res.status(404).json({ message: "Linha não encontrada para este veículo" });

        const idLinhaOficial = linhaAlvo.idLinha || linhaAlvo.id;
        const idVeiculoMongo = linhaAlvo.veiculo?.id;

        // 3. Busca Paralela: Rota Planejada + Rota Executada
        const [resProg, resExec] = await Promise.all([
            // Rota Programada (ABM)
            axios.get(`https://abmbus.com.br:8181/api/linha/${idLinhaOficial}`, { headers: headersAbm })
                .catch(() => ({ data: { desenhoRota: [] } })),
            
            // Rota Executada (Mongo)
            idVeiculoMongo 
                ? axios.get(`https://abmbus.com.br:8181/api/rota/temporealmongo/${idVeiculoMongo}?idLinha=${idLinhaOficial}`, { headers: headersAbm })
                    .catch(() => ({ data: [] }))
                : Promise.resolve({ data: [] })
        ]);

        // 4. Processamento Geométrico
        
        // Parse Programado
        let rastroOficial = [];
        const rawProg = resProg.data.desenhoRota || [];
        // Normaliza coordenadas para array [lat, lng]
        rastroOficial = rawProg.map((p: any) => [parseFloat(p.latitude || p.lat), parseFloat(p.longitude || p.lng)]);

        // Parse Executado
        let rastroExecutado = [];
        const rawExec = Array.isArray(resExec.data) ? (resExec.data[0]?.logRotaDiarias || []) : [];
        rastroExecutado = rawExec.map((p: any) => [parseFloat(p.latitude), parseFloat(p.longitude)]);

        // Paradas (Waypoints)
        const paradas = linhaAlvo.pontoDeParadas || [];
        const pontosMapa = paradas.map((p: any) => ({
            lat: parseFloat(p.latitude),
            lng: parseFloat(p.longitude),
            passou: p.passou || false,
            nome: p.descricao || 'Ponto'
        })).filter((p: any) => p.lat && p.lng);

        // Define Destino
        const destinoFinal = tipo === 'inicial' ? pontosMapa[0] : pontosMapa[pontosMapa.length - 1];
        if (!destinoFinal) return res.status(400).json({ message: "Sem paradas definidas" });

        // Filtra waypoints para TomTom (Ignora os que já passou)
        let waypointsTomTom = [];
        if (tipo !== 'inicial') {
            let inicioValido = false;
            for (const p of pontosMapa) {
                if (p.passou) continue;
                
                // Só começa a adicionar pontos se estivermos "perto" (na lógica simples, o primeiro não passado)
                if (!inicioValido) {
                    // Aqui você pode adicionar logica de distancia se quiser
                    inicioValido = true;
                }
                
                if (inicioValido) {
                    waypointsTomTom.push(p);
                    if (p.lat === destinoFinal.lat && p.lng === destinoFinal.lng) break;
                }
            }
        }
        
        // Limita quantidade para não estourar URL da TomTom (máx ~15)
        const waypointsEnvio = waypointsTomTom.slice(0, 15);

        // Monta String TomTom: Origem:Lat,Lng ... :Lat,Lng ... :Destino
        let coordsString = `${latAtual},${lngAtual}`; // Origem
        
        waypointsEnvio.forEach(p => {
            coordsString += `:${p.lat},${p.lng}`;
        });

        // Se a lista de waypoints não incluiu o destino final, adiciona
        const ultimoWP = waypointsEnvio[waypointsEnvio.length - 1];
        if (!ultimoWP || (ultimoWP.lat !== destinoFinal.lat)) {
            coordsString += `:${destinoFinal.lat},${destinoFinal.lng}`;
        }

        // 5. Chama TomTom
        const tomTomData = await calculateTomTomRoute(coordsString);
        
        const summary = tomTomData.routes?.[0]?.summary || { travelTimeInSeconds: 0, lengthInMeters: 0 };
        const segundos = summary.travelTimeInSeconds;
        const metros = summary.lengthInMeters;

        // Formata Texto
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const tempoTxt = horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`;

        // 6. Resposta Final Otimizada
        return res.json({
            tempo: tempoTxt,
            distancia: (metros / 1000).toFixed(2) + " km",
            duracaoSegundos: segundos,
            origem_endereco: veiculoData.endereco || `Lat: ${latAtual.toFixed(4)}, Lng: ${lngAtual.toFixed(4)}`,
            destino_endereco: destinoFinal.nome,
            
            // Dados para o Leaflet (Simplificados)
            veiculo_pos: [latAtual, lngAtual],
            rastro_oficial: simplificarRota(rastroOficial), // Node faz a matemática pesada
            rastro_real: simplificarRota(rastroExecutado),
            waypoints_usados: waypointsEnvio.map(p => [p.lat, p.lng]),
            todos_pontos_visual: pontosMapa
        });

    } catch (error: any) {
        console.error("Erro Rota:", error.message);
        return res.status(500).json({ message: error.message || "Erro interno ao calcular rota" });
    }
};
