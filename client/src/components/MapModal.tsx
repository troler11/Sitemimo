import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// Ícones (Mantidos)
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
    onClose: () => void;
}

interface RotaData {
    lat: number;
    lng: number;
    tempo: string;
    distancia: string;
    duracaoSegundos: number;
    rastro_oficial: [number, number][]; 
    rastro_real: [number, number][];
    rastro_tomtom: [number, number][]; // Rota detalhada (ruas)
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

const MapModal: React.FC<MapModalProps> = ({ placa, idLinha, tipo, onClose }) => {
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
            // Pega início, meio e fim da rota calculada para garantir bom zoom
            points.push(data.rastro_tomtom[0]);
            points.push(data.rastro_tomtom[Math.floor(data.rastro_tomtom.length / 2)]);
            points.push(data.rastro_tomtom[data.rastro_tomtom.length - 1]);
        }
        return points;
    };

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content shadow">
                    <div className="modal-header border-0 pb-0">
                        <h5 className="modal-title fw-bold text-primary">
                            <i className="bi bi-map me-2"></i>Detalhamento da Rota
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0 position-relative" style={{ minHeight: '550px' }}>
                        {loading && (
                            <div className="position-absolute w-100 h-100 bg-white d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 1000 }}>
                                <div className="spinner-border text-primary" role="status"></div>
                                <div className="mt-2 text-muted">Calculando melhor rota...</div>
                            </div>
                        )}

                        {error && <div className="alert alert-danger m-3">{error}</div>}

                        {!loading && data && (
                            <>
                                {/* HEADER INFO */}
                                <div className="p-3 bg-light border-bottom">
                                    <div className="d-flex justify-content-between align-items-center mb-3 p-2 border rounded bg-white">
                                        <h5 className="mb-0 fw-bold text-dark"><i className="bi bi-bus-front me-2 text-primary"></i>{placa}</h5>
                                        <span className="badge bg-success">Online</span>
                                    </div>
                                    <div className="row g-2 mb-3">
                                        <div className="col-6"><div className="p-2 border rounded bg-white shadow-sm h-100"><small className="text-secondary fw-bold text-uppercase" style={{fontSize:'0.7rem'}}>Origem</small><br/><span className="fw-semibold">{data.origem_endereco}</span></div></div>
                                        <div className="col-6"><div className="p-2 border rounded bg-white shadow-sm h-100"><small className="text-secondary fw-bold text-uppercase" style={{fontSize:'0.7rem'}}>Destino</small><br/><span className="fw-semibold">{data.destino_endereco}</span></div></div>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-center p-2 border rounded" style={{backgroundColor:'#e0f2fe'}}>
                                        <strong className="text-dark"><i className="bi bi-stopwatch-fill me-2"></i>Estimativa:</strong>
                                        <div className="text-end"><span className="fs-4 fw-bold text-dark">{data.tempo}</span><span className="text-muted mx-2">|</span><span className="fs-5 text-dark">{data.distancia}</span></div>
                                    </div>
                                </div>

                                {/* MAPA */}
                                <div style={{ height: '550px', width: '100%' }}>
                                    <MapContainer center={data.veiculo_pos as LatLngExpression} zoom={13} style={{ height: '100%', width: '100%' }}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                                        <MapAdjuster bounds={getBounds()} />

                                        {/* ROTA OFICIAL (Vermelho) */}
                                        {data.rastro_oficial && <Polyline positions={data.rastro_oficial as LatLngExpression[]} color="#ff0505" weight={6} opacity={0.4} />}

                                        {/* ROTA REAL (Preto Pontilhado) */}
                                        {data.rastro_real && <Polyline positions={data.rastro_real as LatLngExpression[]} color="#000" weight={3} dashArray="3, 6" opacity={0.7} />}

                                        {/* ROTA CALCULADA TOMTOM (Azul - Estradas Reais) */}
                                        {data.rastro_tomtom && <Polyline positions={data.rastro_tomtom as LatLngExpression[]} color="#0d6efd" weight={4} opacity={0.9} />}

                                        {/* CONEXÃO PONTILHADA (Veículo -> Rota) */}
                                        {data.rastro_tomtom && data.rastro_tomtom.length > 0 && (
                                            <Polyline positions={[data.veiculo_pos, data.rastro_tomtom[0]] as LatLngExpression[]} color="#0d6efd" weight={2} dashArray="5, 5" opacity={0.8} />
                                        )}

                                        {/* PONTOS DE PARADA (BOLINHAS) */}
                                        {tipo === 'final' && data.todos_pontos_visual && data.todos_pontos_visual.map((p, i) => {
                                            const isFirst = i === 0;
                                            const isLast = i === data.todos_pontos_visual.length - 1;
                                            
                                            // Se for primeiro ou último, desenha bandeira (Marker)
                                            if (isFirst || isLast) {
                                                return <Marker key={i} position={[p.lat, p.lng]} icon={isFirst ? iconStart : iconEnd}><Popup>{p.nome}</Popup></Marker>;
                                            }
                                            
                                            // Se for intermediário, desenha bolinha
                                            return (
                                                <CircleMarker 
                                                    key={i} 
                                                    center={[p.lat, p.lng]} 
                                                    radius={4} 
                                                    pathOptions={{
                                                        fillColor: p.passou ? '#555' : '#0d6efd',
                                                        color: 'transparent',
                                                        fillOpacity: 0.9
                                                    }}
                                                >
                                                    <Popup><b>{p.nome}</b></Popup>
                                                </CircleMarker>
                                            );
                                        })}

                                        {/* VEÍCULO */}
                                        <Marker position={data.veiculo_pos as LatLngExpression} icon={iconBus} zIndexOffset={1000}>
                                            <Popup><b>{placa}</b><br/>Atualizado agora</Popup>
                                        </Marker>
                                    </MapContainer>
                                </div>

                                {/* LEGENDA */}
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
