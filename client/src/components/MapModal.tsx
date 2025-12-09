import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
// 1. CORREÇÃO: Importar api centralizada
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// --- ÍCONES PERSONALIZADOS (Mesmos do original) ---
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

// --- TIPAGEM ---
interface MapModalProps {
    placa: string;
    idLinha: string;
    tipo: 'inicial' | 'final'; // Previsão inicial ou final
    onClose: () => void;
}

interface RotaData {
    lat: number;
    lng: number;
    tempo: string;
    distancia: string;
    duracaoSegundos: number;
    rastro_oficial: [number, number][]; // [lng, lat] do backend
    rastro_real: [number, number][];
    waypoints_usados: [number, number][];
    origem_endereco: string;
    destino_endereco: string;
    veiculo_pos: [number, number]; // [lat, lng]
}

// --- COMPONENTE AUXILIAR PARA AJUSTAR ZOOM (FITBOUNDS) ---
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
                // 2. CORREÇÃO:
                // - Removemos 'http://localhost:3000/api'
                // - Removemos o 'token' manual (o api.ts cuida disso)
                
                const url = tipo === 'inicial' 
                    ? `/rota/inicial/${placa}` 
                    : `/rota/final/${placa}`;

                // Chamada limpa
                const res = await api.get(url, {
                    params: { idLinha }
                });
                
                setData(res.data);
            } catch (err: any) {
                console.error(err);
                setError('Erro ao carregar dados da rota. ' + (err.response?.data?.message || ''));
            } finally {
                setLoading(false);
            }
        };

        if (placa) fetchRoute();
    }, [placa, idLinha, tipo]);

    // Helpers para inverter coords se necessário (GeoJSON [lng, lat] -> Leaflet [lat, lng])
    const fixCoords = (coords: number[][]): LatLngExpression[] => {
        return coords.map(c => [c[1], c[0]] as LatLngExpression); 
    };

    // Calcula limites do mapa para zoom automático
    const getBounds = (): LatLngBoundsExpression => {
        if (!data) return [];
        const points: any[] = [];
        if (data.veiculo_pos) points.push(data.veiculo_pos);
        if (data.rastro_oficial?.length) points.push([data.rastro_oficial[0][1], data.rastro_oficial[0][0]]); // Inverte lng/lat
        return points;
    };

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content shadow">
                    <div className="modal-header">
                        <h5 className="modal-title fw-bold text-primary">
                            <i className="bi bi-map-fill me-2"></i>
                            Detalhamento: {placa} ({tipo === 'inicial' ? 'Chegada' : 'Destino'})
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body p-0 position-relative" style={{ minHeight: '500px' }}>
                        {loading && (
                            <div className="position-absolute w-100 h-100 bg-white d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 1000 }}>
                                <div className="spinner-border text-primary" role="status"></div>
                                <div className="mt-2 text-muted">Calculando melhor rota...</div>
                            </div>
                        )}

                        {error && (
                            <div className="alert alert-danger m-3">{error}</div>
                        )}

                        {!loading && data && (
                            <>
                                {/* --- PAINEL DE INFORMAÇÕES (Topo) --- */}
                                <div className="p-3 bg-light border-bottom">
                                    <div className="row g-2">
                                        <div className="col-md-6">
                                            <div className="card p-2 shadow-sm h-100">
                                                <small className="text-secondary fw-bold text-uppercase">Local Atual</small>
                                                <div className="fw-semibold">{data.origem_endereco}</div>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <div className="card p-2 shadow-sm h-100">
                                                <small className="text-secondary fw-bold text-uppercase">Destino Estimado</small>
                                                <div className="fw-semibold">{data.destino_endereco}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-center mt-2 p-2 bg-white rounded border">
                                        <div>
                                            <span className="badge bg-primary me-2">Estimativa TomTom</span>
                                            <span className="fw-bold fs-5">{data.tempo}</span>
                                        </div>
                                        <div className="text-muted">
                                            Distância: <strong>{data.distancia}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* --- MAPA LEAFLET --- */}
                                <div style={{ height: '500px', width: '100%' }}>
                                    <MapContainer center={data.veiculo_pos as LatLngExpression} zoom={13} style={{ height: '100%', width: '100%' }}>
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            attribution='&copy; OpenStreetMap contributors'
                                        />

                                        {/* Ajusta Zoom */}
                                        <MapAdjuster bounds={getBounds()} />

                                        {/* Rota Oficial (Vermelho Fundo) */}
                                        {data.rastro_oficial && (
                                            <Polyline 
                                                positions={fixCoords(data.rastro_oficial as any)} 
                                                color="#ff0505" 
                                                weight={6} 
                                                opacity={0.3} 
                                            />
                                        )}

                                        {/* Rota Real Executada (Preto Pontilhado) */}
                                        {data.rastro_real && (
                                            <Polyline 
                                                positions={fixCoords(data.rastro_real as any)} 
                                                color="#000" 
                                                weight={3} 
                                                dashArray="5, 10" 
                                                opacity={0.7} 
                                            />
                                        )}

                                        {/* Rota Calculada/Waypoints (Azul) */}
                                        {data.waypoints_usados && (
                                            <Polyline 
                                                positions={fixCoords(data.waypoints_usados as any)} 
                                                color="#0d6efd" 
                                                weight={4} 
                                                opacity={0.9} 
                                            />
                                        )}

                                        {/* Marcador do Veículo */}
                                        <Marker position={data.veiculo_pos as LatLngExpression} icon={iconBus}>
                                            <Popup><b>{placa}</b><br/>Atualizado agora</Popup>
                                        </Marker>

                                        {/* Marcador Destino */}
                                        {data.waypoints_usados && data.waypoints_usados.length > 0 && (
                                            <Marker 
                                                position={[
                                                    data.waypoints_usados[data.waypoints_usados.length - 1][1],
                                                    data.waypoints_usados[data.waypoints_usados.length - 1][0]
                                                ] as LatLngExpression} 
                                                icon={iconEnd}
                                            >
                                                <Popup>Destino</Popup>
                                            </Marker>
                                        )}
                                    </MapContainer>
                                </div>
                                
                                {/* Legenda */}
                                <div className="d-flex justify-content-center gap-3 py-2 small bg-white border-top">
                                    <span className="d-flex align-items-center"><i className="bi bi-circle-fill text-dark me-1" style={{opacity:0.5}}></i> Executado</span>
                                    <span className="d-flex align-items-center"><i className="bi bi-circle-fill text-danger me-1" style={{opacity:0.5}}></i> Oficial</span>
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
