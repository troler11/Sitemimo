import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURAÇÃO DE ÍCONES (Mantida) ---
const iconBus = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
    iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -30]
});
const iconStart = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});
const iconEnd = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});

// --- INTERFACES ---
interface MapModalProps {
    placa: string;
    idLinha: string;
    tipo: 'inicial' | 'final';
    pf: string;
    onClose: () => void;
}

interface RotaData {
    lat: number;
    lng: number;
    tempo: string;
    distancia: string;
    pf: string;
    previsao_chegada: string;
    rastro_oficial: [number, number][]; 
    rastro_real: [number, number][];
    rastro_tomtom: [number, number][];
    todos_pontos_visual: { lat: number, lng: number, nome: string, passou: boolean }[];
    origem_endereco: string;
    destino_endereco: string;
    veiculo_pos: [number, number];
}

// --- ZOOM AUTOMÁTICO ---
const MapAdjuster = ({ bounds }: { bounds: LatLngBoundsExpression }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds && (bounds as any).length > 0) {
            try {
                map.fitBounds(bounds, { padding: [50, 50] });
            } catch (e) { }
        }
    }, [bounds, map]);
    return null;
};

// --- COMPONENTE PRINCIPAL ---
const MapModal: React.FC<MapModalProps> = ({ placa, idLinha, tipo, pf, onClose }) => {
    const [data, setData] = useState<RotaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchRoute = async () => {
            setLoading(true);
            setError('');
            try {
                const url = tipo === 'inicial' ? `/rota/inicial/${encodeURIComponent(placa)}` : `/rota/final/${encodeURIComponent(placa)}`;
                const res = await api.get(url, { params: { idLinha } });
                setData(res.data);
            } catch (err: any) {
                console.error(err);
                setError('Erro ao carregar dados da rota.');
            } finally {
                setLoading(false);
            }
        };
        if (placa) fetchRoute();
    }, [placa, idLinha, tipo]);

    // --- LÓGICA DE CORTE DE ROTA (A MÁGICA DO DESVIO) ---
    const rotaTomTomInteligente = useMemo(() => {
        if (!data?.rastro_tomtom || !data?.veiculo_pos) return [];

        const rota = data.rastro_tomtom;
        const [vLat, vLng] = data.veiculo_pos;

        // Se o veículo não tem posição válida, retorna tudo
        if (vLat === 0 && vLng === 0) return rota;

        // Algoritmo: Encontrar o índice do ponto na rota MAIS PRÓXIMO do veículo
        let menorDistancia = Infinity;
        let indiceMaisProximo = 0;

        // Percorre a rota para achar onde o ônibus "encaixa" geometricamente
        for (let i = 0; i < rota.length; i++) {
            const [pLat, pLng] = rota[i];
            // Distância Euclidiana simples (suficiente para visualização de mapa)
            const dist = Math.sqrt(Math.pow(pLat - vLat, 2) + Math.pow(pLng - vLng, 2));
            
            if (dist < menorDistancia) {
                menorDistancia = dist;
                indiceMaisProximo = i;
            }
        }

        // Retorna a rota cortada: Apenas do ponto mais próximo para frente.
        // Isso ignora visualmente os pontos "pulados" ou deixados para trás.
        return rota.slice(indiceMaisProximo);

    }, [data?.rastro_tomtom, data?.veiculo_pos]);


    // Calcula limites do mapa
    const bounds = useMemo((): LatLngBoundsExpression => {
        if (!data) return [];
        const points: any[] = [];
        
        if (data.veiculo_pos && data.veiculo_pos[0] !== 0) points.push(data.veiculo_pos);
        
        // Usa a rota oficial para garantir enquadramento geral
        if (data.rastro_oficial?.length) {
            points.push(data.rastro_oficial[0]);
            points.push(data.rastro_oficial[Math.floor(data.rastro_oficial.length / 2)]);
            points.push(data.rastro_oficial[data.rastro_oficial.length - 1]);
        }
        return points;
    }, [data]);

    // Otimização para Rota Real (Histórico)
    const rastroRealOtimizado = useMemo(() => {
        if (!data?.rastro_real) return [];
        if (data.rastro_real.length > 600) {
            return data.rastro_real.filter((_, i) => i % 3 === 0);
        }
        return data.rastro_real;
    }, [data?.rastro_real]);

    const getCorPrevisao = (prev: string, prog: string) => {
        if (!prev || prev === 'N/D' || !prog || prog === 'N/D') return 'text-dark';
        if (prev > prog) return 'text-danger';
        return 'text-success';
    };

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content shadow border-0">
                    
                    {/* Header */}
                    <div className="modal-header border-bottom-0 pb-0 pt-3">
                        <div className="d-flex align-items-center">
                            <h5 className="modal-title fw-bold text-dark me-3 d-flex align-items-center">
                                <span className="bg-primary text-white rounded px-2 py-1 me-2 fs-6">
                                    <i className="bi bi-bus-front-fill"></i>
                                </span>
                                {placa}
                            </h5>
                            {data && (
                                <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3">
                                    <i className="bi bi-broadcast me-1"></i>Online
                                </span>
                            )}
                        </div>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0 position-relative d-flex flex-column" style={{ minHeight: '600px' }}>
                        
                        {loading && (
                            <div className="position-absolute top-0 start-0 w-100 h-100 bg-white d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 1050 }}>
                                <div className="spinner-border text-primary mb-2" role="status" style={{width: '3rem', height: '3rem'}}></div>
                                <div className="text-muted fw-bold">Recalculando rota...</div>
                            </div>
                        )}

                        {error && <div className="alert alert-danger m-4 shadow-sm">{error}</div>}

                        {!loading && data && (
                            <>
                                {/* PAINEL DE DADOS */}
                                <div className="px-4 py-3 bg-light border-bottom">
                                    <div className="row g-3">
                                        <div className="col-md-5">
                                            <div className="d-flex gap-3">
                                                <div className="p-3 bg-white border rounded shadow-sm flex-fill text-center">
                                                    <small className="text-muted fw-bold text-uppercase d-block mb-1" style={{fontSize:'0.7rem'}}>
                                                        Final Programado
                                                    </small>
                                                    <h3 className="mb-0 fw-bold text-dark">{data.pf}</h3>
                                                </div>
                                                <div className="p-3 bg-white border rounded shadow-sm flex-fill text-center border-primary border-opacity-25" style={{backgroundColor: '#f8fbff'}}>
                                                    <small className="text-primary fw-bold text-uppercase d-block mb-1" style={{fontSize:'0.7rem'}}>
                                                        Previsão Real
                                                    </small>
                                                    <h3 className={`mb-0 fw-bold ${getCorPrevisao(data.previsao_chegada, pf)}`}>
                                                        {data.previsao_chegada}
                                                    </h3>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-md-7 d-flex align-items-center">
                                            <div className="w-100 ps-md-3 border-start-md">
                                                <div className="d-flex justify-content-between mb-2">
                                                    <span className="badge bg-secondary text-light"><i className="bi bi-clock me-1"></i>{data.tempo}</span>
                                                    <span className="badge bg-secondary text-light"><i className="bi bi-rulers me-1"></i>{data.distancia}</span>
                                                </div>
                                                <div className="small text-muted mb-1 text-truncate">
                                                    <i className="bi bi-geo-alt-fill text-danger me-1"></i> {data.origem_endereco}
                                                </div>
                                                <div className="small text-muted text-truncate">
                                                    <i className="bi bi-flag-fill text-success me-1"></i> {data.destino_endereco}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ÁREA DO MAPA */}
                                <div className="flex-grow-1 position-relative bg-light" style={{ minHeight: '400px' }}>
                                    
                                    {data.veiculo_pos && data.veiculo_pos[0] !== 0 ? (
                                        <MapContainer 
                                            key={`${data.veiculo_pos[0]}-${data.veiculo_pos[1]}`}
                                            center={data.veiculo_pos as LatLngExpression} 
                                            zoom={13} 
                                            style={{ height: '100%', width: '100%', minHeight: '400px' }}
                                        >
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                                            <MapAdjuster bounds={bounds} />

                                            {/* 1. ROTA OFICIAL (FUNDO / CINZA) */}
                                            {data.rastro_oficial && (
                                                <Polyline 
                                                    positions={data.rastro_oficial as LatLngExpression[]} 
                                                    color="#ff0505" 
                                                    weight={6} 
                                                    opacity={0.4} 
                                                />
                                            )}
                                            
                                            {/* 2. ROTA REAL (PRETO TRACEJADO) */}
                                            {rastroRealOtimizado && (
                                                <Polyline 
                                                    positions={rastroRealOtimizado as LatLngExpression[]} 
                                                    color="#212529" 
                                                    weight={3} 
                                                    dashArray="5, 10" 
                                                    opacity={0.8} 
                                                />
                                            )}
                                            
                                            {/* 3. PREVISÃO TOMTOM INTELIGENTE (Azul) */}
                                            {/* Usa o array CORTADO para ignorar pontos para trás */}
                                            {rotaTomTomInteligente && (
                                                <Polyline 
                                                    positions={rotaTomTomInteligente as LatLngExpression[]} 
                                                    color="#0d6efd" 
                                                    weight={5} 
                                                    opacity={0.9} 
                                                />
                                            )}
                                            
                                            {/* CONECTOR INTELIGENTE: Veículo -> Ponto mais próximo da rota */}
                                            {rotaTomTomInteligente && rotaTomTomInteligente.length > 0 && (
                                                <Polyline 
                                                    positions={[data.veiculo_pos, rotaTomTomInteligente[0]] as LatLngExpression[]} 
                                                    color="#0d6efd" 
                                                    weight={2} 
                                                    dashArray="5, 5" 
                                                    opacity={0.6} 
                                                />
                                            )}

                                            {/* PONTOS DE PARADA */}
                                            {tipo === 'final' && data.todos_pontos_visual && data.todos_pontos_visual.map((p, i) => {
                                                const isFirst = i === 0;
                                                const isLast = i === data.todos_pontos_visual.length - 1;
                                                
                                                if (isFirst || isLast) {
                                                    return <Marker key={i} position={[p.lat, p.lng]} icon={isFirst ? iconStart : iconEnd}><Popup>{p.nome}</Popup></Marker>;
                                                }
                                                return (
                                                    <CircleMarker 
                                                        key={i} center={[p.lat, p.lng]} radius={5} 
                                                        pathOptions={{ fillColor: p.passou ? '#6c757d' : '#0d6efd', color: '#fff', weight: 1, fillOpacity: 1 }}
                                                    >
                                                        <Popup><b>{p.nome}</b><br/>{p.passou ? 'Já passou' : 'Vai passar'}</Popup>
                                                    </CircleMarker>
                                                );
                                            })}

                                            {/* VEÍCULO */}
                                            <Marker position={data.veiculo_pos as LatLngExpression} icon={iconBus} zIndexOffset={9999}>
                                                <Popup>
                                                    <div className="text-center">
                                                        <strong className="d-block">{placa}</strong>
                                                        <span className="text-success small">Online</span>
                                                    </div>
                                                </Popup>
                                            </Marker>

                                        </MapContainer>
                                    ) : (
                                        <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                            <div className="text-center">
                                                <i className="bi bi-geo-alt-slash fs-1 mb-2 d-block opacity-50"></i>
                                                <span>Sem sinal de GPS disponível no momento.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white border-top py-2 px-3 d-flex justify-content-center gap-4 small text-muted">
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#212529'}}></span> Histórico Real</div>
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#0d6efd'}}></span> Rota Adaptativa</div>
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#ff0505'}}></span> Rota Oficial</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapModal;
