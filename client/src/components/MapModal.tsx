import React, { useEffect, useState, useMemo } from 'react';
import { GoogleMap, LoadScript, Polyline, Marker } from '@react-google-maps/api';
import api from '../services/api'; 
import { findNearestPointIndex, Coordenada } from '../utils/geo';

// CORREÇÃO: Evita erro de build 'google is not defined'
declare var google: any;

const containerStyle = { width: '100%', height: '500px' };
const centerDefault = { lat: -23.55052, lng: -46.633308 };

interface MapModalProps {
    placa: string;
    idLinha: string;
    tipo: 'inicial' | 'final';
    pf?: string; 
    onClose: () => void;
}

const MapModal: React.FC<MapModalProps> = ({ placa, idLinha, pf, onClose }) => {
    const [rotaFixa, setRotaFixa] = useState<Coordenada[]>([]);
    const [posicaoVeiculo, setPosicaoVeiculo] = useState<Coordenada | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const carregarDados = async () => {
            try {
                setLoading(true);
                const [resRota, resVeiculo] = await Promise.all([
                    api.get(`/rotas/${idLinha}/shape`), 
                    api.get(`/veiculos/${placa}/localizacao`)
                ]);

                // Garante que é array
                setRotaFixa(Array.isArray(resRota.data) ? resRota.data : []); 
                setPosicaoVeiculo(resVeiculo.data || null); 
            } catch (error) {
                console.error("Erro ao carregar mapa", error);
                setRotaFixa([]);
            } finally {
                setLoading(false);
            }
        };
        carregarDados();
    }, [idLinha, placa]);

    // CORREÇÃO CRÍTICA DO ERRO 't.push is not a function'
    const { caminhoPercorrido, caminhoFuturo } = useMemo(() => {
        // Validação de segurança
        if (!Array.isArray(rotaFixa) || rotaFixa.length === 0 || !posicaoVeiculo) {
            return { 
                caminhoPercorrido: [], 
                caminhoFuturo: Array.isArray(rotaFixa) ? rotaFixa : [] 
            };
        }

        const indexCorte = findNearestPointIndex(rotaFixa, posicaoVeiculo);

        // USAMOS SPREAD (...) AO INVÉS DE PUSH PARA EVITAR ERRO DE IMUTABILIDADE
        const azul = [
            ...rotaFixa.slice(0, indexCorte + 1), // Pedaço da rota
            posicaoVeiculo                        // Conecta ao veículo
        ];

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
                            <LoadScript googleMapsApiKey="SUA_CHAVE_GOOGLE_AQUI">
                                <GoogleMap
                                    mapContainerStyle={containerStyle}
                                    center={posicaoVeiculo || centerDefault}
                                    zoom={14}
                                >
                                    {/* Rota Futura (Cinza) - Camada 1 */}
                                    <Polyline
                                        path={caminhoFuturo}
                                        options={{ strokeColor: "#B0B0B0", strokeOpacity: 0.6, strokeWeight: 5, zIndex: 1 }}
                                    />
                                    {/* Rota Percorrida (Azul) - Camada 2 */}
                                    <Polyline
                                        path={caminhoPercorrido}
                                        options={{ strokeColor: "#0d6efd", strokeOpacity: 1.0, strokeWeight: 6, zIndex: 2 }}
                                    />
                                    {/* Veículo */}
                                    {posicaoVeiculo && (
                                       <Marker
        position={posicaoVeiculo}
        icon={{
            // CORREÇÃO AQUI:
            // Em vez de usar 'google.maps.SymbolPath.FORWARD_CLOSED_ARROW' (que causa o erro),
            // usamos o desenho SVG manual dessa seta. Assim não dependemos da variável 'google'.
            path: "M -2,0 0,-2 2,0 0,2 z", 
            
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
