import React, { useEffect, useState, useMemo } from 'react';
import { GoogleMap, LoadScript, Polyline, Marker } from '@react-google-maps/api';
import api from '../services/api'; 
import { findNearestPointIndex, Coordenada } from '../utils/geo';

declare var google: any;


const containerStyle = { width: '100%', height: '500px' };
const centerDefault = { lat: -23.55052, lng: -46.633308 };

interface MapModalProps {
    placa: string;
    idLinha: string;
    tipo: 'inicial' | 'final';
    pf?: string; // Previsão (vem da tabela)
    onClose: () => void;
}

const MapModal: React.FC<MapModalProps> = ({ placa, idLinha, pf, onClose }) => {
    const [rotaFixa, setRotaFixa] = useState<Coordenada[]>([]);
    const [posicaoVeiculo, setPosicaoVeiculo] = useState<Coordenada | null>(null);
    const [loading, setLoading] = useState(true);

    // Carrega dados da API
    useEffect(() => {
        const carregarDados = async () => {
            try {
                setLoading(true);
                // Ajuste os endpoints conforme sua API real
                const [resRota, resVeiculo] = await Promise.all([
                    api.get(`/rotas/${idLinha}/shape`), 
                    api.get(`/veiculos/${placa}/localizacao`)
                ]);

                setRotaFixa(resRota.data || []); 
                setPosicaoVeiculo(resVeiculo.data || null); 
            } catch (error) {
                console.error("Erro ao carregar mapa", error);
            } finally {
                setLoading(false);
            }
        };

        carregarDados();
    }, [idLinha, placa]);

    // Lógica de fatiar a rota (Azul vs Cinza)
    const { caminhoPercorrido, caminhoFuturo } = useMemo(() => {
        if (!rotaFixa.length || !posicaoVeiculo) {
            return { caminhoPercorrido: [], caminhoFuturo: rotaFixa };
        }

        const indexCorte = findNearestPointIndex(rotaFixa, posicaoVeiculo);

        // Azul: Do início até o veículo (incluindo a posição real dele para conectar)
        const azul = rotaFixa.slice(0, indexCorte + 1);
        azul.push(posicaoVeiculo);

        // Cinza: Do veículo até o fim
        const cinza = rotaFixa.slice(indexCorte);

        return { caminhoPercorrido: azul, caminhoFuturo: cinza };
    }, [rotaFixa, posicaoVeiculo]);

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <div>
                            <h5 className="modal-title mb-0">Rastreio: <span className="text-primary fw-bold">{placa}</span></h5>
                            <small className="text-muted">Previsão de Chegada: <strong>{pf || '--:--'}</strong></small>
                        </div>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body p-0">
                        {loading ? (
                            <div className="d-flex justify-content-center align-items-center" style={{ height: '500px' }}>
                                <span className="spinner-border text-primary"></span>
                            </div>
                        ) : (
                            <LoadScript googleMapsApiKey="SUA_API_KEY_AQUI">
                                <GoogleMap
                                    mapContainerStyle={containerStyle}
                                    center={posicaoVeiculo || centerDefault}
                                    zoom={14}
                                >
                                    {/* Rota Futura (Cinza) - Fundo */}
                                    <Polyline
                                        path={caminhoFuturo}
                                        options={{ strokeColor: "#B0B0B0", strokeOpacity: 0.6, strokeWeight: 5, zIndex: 1 }}
                                    />
                                    {/* Rota Percorrida (Azul) - Frente */}
                                    <Polyline
                                        path={caminhoPercorrido}
                                        options={{ strokeColor: "#0d6efd", strokeOpacity: 1.0, strokeWeight: 6, zIndex: 2 }}
                                    />
                                    {/* Ícone do Ônibus */}
                                    {posicaoVeiculo && (
                                        <Marker
                                            position={posicaoVeiculo}
                                            icon={{
                                                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                                scale: 6,
                                                fillColor: "#0d6efd",
                                                fillOpacity: 1,
                                                strokeWeight: 2,
                                                strokeColor: "#ffffff" 
                                            }}
                                        />
                                    )}
                                </GoogleMap>
                            </LoadScript>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapModal;
