import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// Ícones
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

interface MapModalProps {
    placa: string;
    idLinha: string;
    tipo: 'inicial' | 'final';
    pf: string; // <--- RECEBE O PROGRAMADO FINAL
    onClose: () => void;
}

interface RotaData {
    lat: number;
    lng: number;
    tempo: string;
    distancia: string;
    previsao_chegada: string; // Vem do Backend (Cálculo TomTom)
    rastro_oficial: [number, number][]; 
    rastro_real: [number, number][];
    rastro_tomtom: [number, number][];
    todos_pontos_visual: { lat: number, lng: number, nome: string, passou: boolean }[];
    origem_endereco: string;
    destino_endereco: string;
    veiculo_pos: [number, number];
}

const MapAdjuster = ({ bounds }: { bounds: LatLngBoundsExpression }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds && (bounds as any).length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
};

const MapModal: React.FC<MapModalProps> = ({ placa, idLinha, tipo, pf, onClose }) => {
    const [data, setData] = useState<RotaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchRoute = async () => {
            setLoading(true);
            setError('');
            try {
                const url = tipo === 'inicial' ? `/rota/inicial/${placa}` : `/rota/final/${placa}`;
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

    const getBounds = (): LatLngBoundsExpression => {
        if (!data) return [];
        const points: any[] = [];
        if (data.veiculo_pos) points.push(data.veiculo_pos);
        if (data.rastro_tomtom?.length) {
            points.push(data.rastro_tomtom[0]);
            points.push(data.rastro_tomtom[Math.floor(data.rastro_tomtom.length / 2)]);
            points.push(data.rastro_tomtom[data.rastro_tomtom.length - 1]);
        }
        return points;
    };

    // Helper de cor para a previsão
    const getCorPrevisao = (prev: string, prog: string) => {
        if (!prev || prev === 'N/D' || !prog || prog === 'N/D') return 'text-dark';
        if (prev > prog) return 'text-danger'; // Atrasado
        return 'text-success'; // Adiantado/Pontual
    };

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content shadow">
                    
                    {/* Header Limpo */}
                    <div className="modal-header border-0 pb-0">
                        <div className="d-flex align-items-center">
                            <h5 className="modal-title fw-bold text-dark me-3">
                                <i className="bi bi-bus-front-fill me-2 text-primary"></i>{placa}
                            </h5>
                            {data && (
                                <span className="badge bg-light text-secondary border">
                                    <i className="bi bi-broadcast me-1 text-success"></i>Online
                                </span>
                            )}
                        </div>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0 position-relative" style={{ minHeight: '550px' }}>
                        {loading && (
                            <div className="position-absolute w-100 h-100 bg-white d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 1000 }}>
                                <div className="spinner-border text-primary" role="status"></div>
                                <div className="mt-2 text-muted">Calculando previsão em tempo real...</div>
                            </div>
                        )}

                        {error && <div className="alert alert-danger m-3">{error}</div>}

                        {!loading && data && (
                            <>
                                {/* --- PAINEL DE HORÁRIOS (LAYOUT ORIGINAL) --- */}
                                <div className="p-3 bg-white border-bottom">
                                    <div className="row g-0 text-center rounded border overflow-hidden">
                                        
                                        {/* LADO ESQUERDO: PROGRAMADO */}
                                        <div className="col-6 p-3 bg-light border-end">
                                            <small className="text-secondary fw-bold text-uppercase d-block mb-1">
                                                Final Programado
                                            </small>
                                            <h2 className="mb-0 fw-bold text-dark">{pf || '--:--'}</h2>
                                        </div>

                                        {/* LADO DIREITO: PREVISÃO */}
                                        <div className="col-6 p-3 bg-white">
                                            <small className="text-secondary fw-bold text-uppercase d-block mb-1">
                                                Previsão Atualizada
                                            </small>
                                            <h2 className={`mb-0 fw-bold ${getCorPrevisao(data.previsao_chegada, pf)}`}>
                                                {data.previsao_chegada}
                                            </h2>
                                            {/* Detalhe extra pequeno */}
                                            <small className="text-muted" style={{fontSize:'0.75rem'}}>
                                                (Tempo restante: {data.tempo})
                                            </small>
                                        </div>

                                    </div>
                                    
                                    {/* Endereços compactos */}
                                    <div className="d-flex justify-content-between mt-2 px-1">
                                        <small className="text-truncate text-muted" style={{maxWidth:'45%'}}><i className="bi bi-geo-alt me-1"></i>{data.origem_endereco}</small>
                                        <i className="bi bi-arrow-right text-muted"></i>
                                        <small className="text-truncate text-muted text-end" style={{maxWidth:'45%'}}><i className="bi bi-flag me-1"></i>{data.destino_endereco}</small>
                                    </div>
                                </div>

                                {/* MAPA */}
                                <div style={{ height: '450px', width: '100%' }}>
                                    <MapContainer center={data.veiculo_pos as LatLngExpression} zoom={13} style={{ height: '100%', width: '100%' }}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                                        <MapAdjuster bounds={getBounds()} />

                                        {/* Rotas */}
                                        {data.rastro_oficial && <Polyline positions={data.rastro_oficial as LatLngExpression[]} color="#ff0505" weight={6} opacity={0.3} />}
                                        {data.rastro_real && <Polyline positions={data.rastro_real as LatLngExpression[]} color="#000" weight={3} dashArray="3, 6" opacity={0.7} />}
                                        {data.rastro_tomtom && <Polyline positions={data.rastro_tomtom as LatLngExpression[]} color="#0d6efd" weight={5} opacity={0.9} />}
                                        
                                        {/* Conexão Veículo -> Rota */}
                                        {data.rastro_tomtom && data.rastro_tomtom.length > 0 && (
                                            <Polyline positions={[data.veiculo_pos, data.rastro_tomtom[0]] as LatLngExpression[]} color="#0d6efd" weight={2} dashArray="5, 5" opacity={0.8} />
                                        )}

                                        {/* Pontos de Parada */}
                                        {tipo === 'final' && data.todos_pontos_visual && data.todos_pontos_visual.map((p, i) => {
                                            const isFirst = i === 0;
                                            const isLast = i === data.todos_pontos_visual.length - 1;
                                            if (isFirst || isLast) {
                                                return <Marker key={i} position={[p.lat, p.lng]} icon={isFirst ? iconStart : iconEnd}><Popup>{p.nome}</Popup></Marker>;
                                            }
                                            return (
                                                <CircleMarker 
                                                    key={i} 
                                                    center={[p.lat, p.lng]} 
                                                    radius={7} 
                                                    pathOptions={{
                                                        fillColor: p.passou ? '#6c757d' : '#0d6efd',
                                                        color: '#ffffff',
                                                        weight: 2,
                                                        fillOpacity: 1
                                                    }}
                                                >
                                                    <Popup><b>{p.nome}</b><br/>{p.passou ? 'Já passou' : 'Vai passar'}</Popup>
                                                </CircleMarker>
                                            );
                                        })}

                                        <Marker position={data.veiculo_pos as LatLngExpression} icon={iconBus} zIndexOffset={1000}>
                                            <Popup><b>{placa}</b></Popup>
                                        </Marker>
                                    </MapContainer>
                                </div>
                                <div className="d-flex justify-content-center gap-3 py-2 small bg-light border-top">
                                    <span className="d-flex align-items-center"><i className="bi bi-circle-fill text-dark me-1" style={{opacity:0.5}}></i> Percorrida</span>
                                    <span className="d-flex align-items-center"><i className="bi bi-circle-fill text-danger me-1" style={{opacity:0.5}}></i> Fixa</span>
                                    <span className="d-flex align-items-center"><i className="bi bi-circle-fill text-primary me-1"></i> Previsão</span>
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
