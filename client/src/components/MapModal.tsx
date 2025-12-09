import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// --- ÍCONES (Mantidos) ---
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
    previsao_chegada: string;
    rastro_oficial: [number, number][]; 
    rastro_real: [number, number][];
    rastro_tomtom: [number, number][];
    todos_pontos_visual: { lat: number, lng: number, nome: string, passou: boolean }[];
    origem_endereco: string;
    destino_endereco: string;
    veiculo_pos: [number, number];
}

// --- SUBCOMPONENTE DE AJUSTE DE ZOOM ---
// Separado e memoizado para evitar re-render desnecessário
const MapAdjuster = React.memo(({ bounds }: { bounds: LatLngBoundsExpression }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds && (bounds as any).length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
});

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

    // 1. OTIMIZAÇÃO: Cálculo de Limites (Bounds) Memoizado
    const bounds = useMemo((): LatLngBoundsExpression => {
        if (!data) return [];
        const points: any[] = [];
        
        if (data.veiculo_pos) points.push(data.veiculo_pos);
        
        // Pega início e fim da rota TomTom
        if (data.rastro_tomtom?.length) {
            points.push(data.rastro_tomtom[0]);
            points.push(data.rastro_tomtom[data.rastro_tomtom.length - 1]);
        }
        
        // Pega início e fim da rota Real (Histórico)
        if (data.rastro_real?.length) {
            points.push(data.rastro_real[0]);
            points.push(data.rastro_real[data.rastro_real.length - 1]);
        }

        return points;
    }, [data]);

    // 2. OTIMIZAÇÃO: Amostragem de Pontos (Reduzir Carga)
    const rastroRealOtimizado = useMemo(() => {
        if (!data?.rastro_real) return [];
        // Se tiver mais de 500 pontos, pega 1 a cada 3 para aliviar o navegador
        if (data.rastro_real.length > 500) {
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
                                    <i className="bi bi-broadcast me-1"></i>Tempo Real
                                </span>
                            )}
                        </div>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0 position-relative d-flex flex-column" style={{ minHeight: '600px' }}>
                        
                        {/* Loading Overlay */}
                        {loading && (
                            <div className="position-absolute top-0 start-0 w-100 h-100 bg-white d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 1050 }}>
                                <div className="spinner-border text-primary mb-2" role="status" style={{width: '3rem', height: '3rem'}}></div>
                                <div className="text-muted fw-bold">Carregando telemetria...</div>
                            </div>
                        )}

                        {error && <div className="alert alert-danger m-4 shadow-sm">{error}</div>}

                        {!loading && data && (
                            <>
                                {/* PAINEL DE DADOS SUPERIOR */}
                                <div className="px-4 py-3 bg-light border-bottom">
                                    <div className="row g-3">
                                        
                                        {/* Coluna 1: Horários */}
                                        <div className="col-md-5">
                                            <div className="d-flex gap-3">
                                                <div className="p-3 bg-white border rounded shadow-sm flex-fill text-center">
                                                    <small className="text-muted fw-bold text-uppercase d-block mb-1" style={{fontSize:'0.7rem'}}>Chegada Programada</small>
                                                    <h3 className="mb-0 fw-bold text-secondary">{pf || '--:--'}</h3>
                                                </div>
                                                <div className="p-3 bg-white border rounded shadow-sm flex-fill text-center border-primary border-opacity-25" style={{backgroundColor: '#f8fbff'}}>
                                                    <small className="text-primary fw-bold text-uppercase d-block mb-1" style={{fontSize:'0.7rem'}}>Previsão Real</small>
                                                    <h3 className={`mb-0 fw-bold ${getCorPrevisao(data.previsao_chegada, pf)}`}>
                                                        {data.previsao_chegada}
                                                    </h3>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Coluna 2: Detalhes da Viagem */}
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

                                {/* MAPA */}
                                <div className="flex-grow-1 position-relative">
                                    <MapContainer center={data.veiculo_pos as LatLngExpression} zoom={13} style={{ height: '100%', width: '100%' }}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                                        
                                        {/* Ajuste Automático de Zoom */}
                                        <MapAdjuster bounds={bounds} />

                                        {/* 1. Rota Oficial (Cinza, Fundo) */}
                                        {data.rastro_oficial && <Polyline positions={data.rastro_oficial as LatLngExpression[]} color="#999" weight={5} opacity={0.3} />}
                                        
                                        {/* 2. Rota Percorrida (Real) - OTIMIZADA */}
                                        {rastroRealOtimizado && <Polyline positions={rastroRealOtimizado as LatLngExpression[]} color="#333" weight={3} dashArray="4, 8" opacity={0.8} />}
                                        
                                        {/* 3. Previsão Futura (TomTom - Azul) */}
                                        {data.rastro_tomtom && <Polyline positions={data.rastro_tomtom as LatLngExpression[]} color="#0d6efd" weight={5} opacity={0.9} />}
                                        
                                        {/* Conector Veículo -> TomTom (Linha tracejada fina) */}
                                        {data.rastro_tomtom && data.rastro_tomtom.length > 0 && (
                                            <Polyline positions={[data.veiculo_pos, data.rastro_tomtom[0]] as LatLngExpression[]} color="#0d6efd" weight={2} dashArray="5, 5" opacity={0.6} />
                                        )}

                                        {/* Pontos de Parada */}
                                        {tipo === 'final' && data.todos_pontos_visual && data.todos_pontos_visual.map((p, i) => {
                                            const isFirst = i === 0;
                                            const isLast = i === data.todos_pontos_visual.length - 1;
                                            
                                            // Renderiza Marcadores de Início/Fim
                                            if (isFirst || isLast) {
                                                return <Marker key={i} position={[p.lat, p.lng]} icon={isFirst ? iconStart : iconEnd}><Popup>{p.nome}</Popup></Marker>;
                                            }
                                            
                                            // Renderiza Pontos Intermediários (Círculos Leves)
                                            return (
                                                <CircleMarker 
                                                    key={i} 
                                                    center={[p.lat, p.lng]} 
                                                    radius={6} 
                                                    pathOptions={{
                                                        fillColor: p.passou ? '#6c757d' : '#0d6efd',
                                                        color: '#fff',
                                                        weight: 2,
                                                        fillOpacity: 1
                                                    }}
                                                >
                                                    <Popup><b>{p.nome}</b><br/>{p.passou ? 'Já passou' : 'Vai passar'}</Popup>
                                                </CircleMarker>
                                            );
                                        })}

                                        {/* Veículo (Sempre por cima) */}
                                        <Marker position={data.veiculo_pos as LatLngExpression} icon={iconBus} zIndexOffset={1000}>
                                            <Popup>
                                                <div className="text-center">
                                                    <b className="d-block">{placa}</b>
                                                    <small className="text-muted">Atualizado agora</small>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    </MapContainer>
                                </div>

                                {/* LEGENDA */}
                                <div className="bg-white border-top py-2 px-3 d-flex justify-content-center gap-4 small text-muted">
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#333'}}></span> Percorrido (Real)</div>
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#0d6efd'}}></span> Previsão (TomTom)</div>
                                    <div className="d-flex align-items-center"><span className="d-inline-block rounded-circle me-1" style={{width: 10, height: 10, backgroundColor: '#999'}}></span> Oficial (Fixa)</div>
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
