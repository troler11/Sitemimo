import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';
import './RouteCreate.css';

// --- Interfaces (Tipagem) ---
interface PontoParada {
    id: number;
    name: string;
    time: string;
    lat: number;
    lng: number;
    type: 'INICIAL' | 'FINAL' | 'PARADA';
}

interface RotaForm {
    descricao: string;
    codigo: string;
    sentido: string;
    cliente: string;
}

// Componente auxiliar para ajustar o zoom do mapa automaticamente
const MapAutoFit = ({ bounds }: { bounds: LatLngExpression[] }) => {
    const map = useMap();
    
    useEffect(() => {
        if (bounds.length > 0) {
            const boundsObj = L.latLngBounds(bounds as LatLngTuple[]);
            map.fitBounds(boundsObj, { 
                padding: [50, 50],
                maxZoom: 15
            });
        }
    }, [bounds, map]);

    return null;
};

const RouteCreate: React.FC = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- ESTADOS ---
    const [form, setForm] = useState<RotaForm>({
        descricao: '', // AGORA INICIA EM BRANCO
        codigo: '',    // AGORA INICIA EM BRANCO
        sentido: 'entrada',
        cliente: 'PACKTEC' // Pode manter um padrão ou deixar vazio também
    });
    
    const [points, setPoints] = useState<PontoParada[]>([]);
    const [routePath, setRoutePath] = useState<LatLngExpression[]>([]);
    const [allBounds, setAllBounds] = useState<LatLngExpression[]>([]);
    const [loading, setLoading] = useState(false);

    // --- Lógica de KML ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            processKML(text);
        };
        reader.readAsText(file);
    };

    const processKML = (xmlString: string) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        const newPoints: PontoParada[] = [];
        const newRoutePath: LatLngExpression[] = [];
        const bounds: LatLngExpression[] = [];

        // 1. Extrair Traçado (Linha Azul)
        const lineStrings = xmlDoc.getElementsByTagName("LineString");
        if (lineStrings.length > 0) {
            for (let i = 0; i < lineStrings.length; i++) {
                const coordsRaw = lineStrings[i].getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (!coordsRaw) continue;

                const pointsArray = coordsRaw.split(/\s+/);
                pointsArray.forEach(p => {
                    const parts = p.split(',');
                    if (parts.length >= 2) {
                        const lng = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            newRoutePath.push([lat, lng]);
                            bounds.push([lat, lng]);
                        }
                    }
                });
            }
        }

        // 2. Extrair Pontos de Parada
        const placemarks = xmlDoc.getElementsByTagName("Placemark");
        for (let i = 0; i < placemarks.length; i++) {
            if (placemarks[i].getElementsByTagName("LineString").length > 0) continue;

            const name = placemarks[i].getElementsByTagName("name")[0]?.textContent || "Ponto";
            const pointTag = placemarks[i].getElementsByTagName("Point")[0];

            if (pointTag) {
                const coords = pointTag.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (coords) {
                    const [lngStr, latStr] = coords.split(',');
                    const lat = parseFloat(latStr);
                    const lng = parseFloat(lngStr);

                    newPoints.push({
                        id: Date.now() + i,
                        name: name,
                        time: '00:00',
                        lat,
                        lng,
                        type: 'PARADA'
                    });
                    bounds.push([lat, lng]);
                }
            }
        }

        setRoutePath(newRoutePath);
        setPoints(newPoints);
        setAllBounds(bounds);
    };

    // --- CRUD Local dos Pontos ---
    const updatePoint = (id: number, field: 'name' | 'time', value: string) => {
        setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    // FUNÇÃO DE EXCLUIR PONTO
    const removePoint = (id: number) => {
        // Filtra removendo o ID selecionado
        setPoints(prev => prev.filter(p => p.id !== id));
        // Nota: O React vai re-renderizar e recalcular quem é o Inicial/Final automaticamente
    };

    // --- Salvar no Backend ---
    const handleSave = async () => {
        // Validação básica
        if (!form.descricao || !form.codigo) {
            Swal.fire('Campos obrigatórios', 'Preencha a descrição e o código da linha.', 'warning');
            return;
        }
        if (points.length === 0) {
            Swal.fire('Atenção', 'Importe um arquivo KML antes de salvar.', 'warning');
            return;
        }

        setLoading(true);

        const payload = {
            ...form,
            pontos: points.map((pt, index) => ({
                ordem: index + 1,
                nome: pt.name,
                horario: pt.time,
                latitude: pt.lat,
                longitude: pt.lng,
                tipo: index === 0 ? 'INICIAL' : (index === points.length - 1 ? 'FINAL' : 'PARADA')
            })),
            tracado_completo: routePath // Envia o desenho da rota também
        };

        try {
            await api.post('/rotas', payload);
            Swal.fire('Sucesso!', 'Rota cadastrada com sucesso.', 'success');
            navigate('/dashboard');
        } catch (error) {
            console.error(error);
            Swal.fire('Erro', 'Falha ao salvar a rota.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="main-content">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <small className="text-muted">Rotas &gt; Nova Rota</small>
                <div className="d-flex align-items-center gap-3">
                    <button 
                        className="btn btn-abm-green shadow-sm" 
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? 'SALVANDO...' : <><i className="fas fa-save me-2"></i> SALVAR NO BANCO</>}
                    </button>
                </div>
            </div>

            {/* CARD 1: FORMULÁRIO */}
            <div className="card-custom">
                <h6 className="section-title">Informações da Linha</h6>
                <div className="row mb-3">
                    <div className="col-md-5">
                        <label>Descrição</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Ex: CAMPI - CENTRO (06:00)"
                            value={form.descricao} 
                            onChange={e => setForm({...form, descricao: e.target.value})}
                        />
                    </div>
                    <div className="col-md-2">
                        <label>Código</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Ex: 6514"
                            value={form.codigo}
                            onChange={e => setForm({...form, codigo: e.target.value})}
                        />
                    </div>
                    <div className="col-md-2">
                        <label>Sentido</label>
                        <select 
                            className="form-select" 
                            value={form.sentido}
                            onChange={e => setForm({...form, sentido: e.target.value})}
                        >
                            <option value="entrada">Entrada</option>
                            <option value="saida">Saída</option>
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label>Veículo Padrão</label>
                        <div className="input-group">
                            <span className="input-group-text bg-light">--</span>
                            <input type="text" className="form-control" placeholder="Opcional" disabled />
                        </div>
                    </div>
                </div>
            </div>

            {/* CARD 2: IMPORTAÇÃO */}
            <div className="card-custom bg-light border-danger border-start border-4">
                <div className="row align-items-center">
                    <div className="col-md-8">
                        <h6 className="mb-2">Importar Rota e Traçado (KML)</h6>
                        <p className="text-muted small mb-0">O sistema desenhará o trajeto exato e os pontos de parada.</p>
                    </div>
                    <div className="col-md-4 text-end">
                        <input 
                            type="file" 
                            accept=".kml" 
                            ref={fileInputRef} 
                            style={{display: 'none'}} 
                            onChange={handleFileUpload}
                        />
                        <button className="btn btn-dark" onClick={() => fileInputRef.current?.click()}>
                            <i className="fas fa-file-import me-2"></i> Carregar KML
                        </button>
                    </div>
                </div>
            </div>

            {/* CARD 3: LISTA DE PONTOS */}
            <div className="card-custom">
                <h6 className="section-title">Roteiro da Linha</h6>
                <div className="points-container">
                    {points.length === 0 ? (
                        <p className="text-center text-muted p-4">Aguardando importação do arquivo KML...</p>
                    ) : (
                        points.map((pt, idx) => {
                            // Definir cores e textos dinamicamente baseados na posição ATUAL do array
                            let labelColor = 'text-primary';
                            let labelText = 'PONTO PARADA';
                            
                            if (idx === 0) { labelColor = 'text-danger'; labelText = 'PTO INICIAL'; }
                            else if (idx === points.length - 1) { labelColor = 'text-success'; labelText = 'PONTO FINAL'; }

                            return (
                                <div key={pt.id} className="row mb-2 align-items-center border-bottom pb-2">
                                    <div className="col-md-2">
                                        <span className={`fw-bold small ${labelColor}`}>{labelText}</span>
                                    </div>
                                    <div className="col-md-6">
                                        <input 
                                            type="text" 
                                            className="form-control form-control-sm" 
                                            value={pt.name}
                                            onChange={e => updatePoint(pt.id, 'name', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-2">
                                        <input 
                                            type="time" 
                                            className="form-control form-control-sm" 
                                            value={pt.time}
                                            onChange={e => updatePoint(pt.id, 'time', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-1 text-center">
                                        {/* Ícone de Exclusão Ativo */}
                                        <i 
                                            className="fas fa-trash-alt text-danger cursor-pointer" 
                                            onClick={() => removePoint(pt.id)}
                                            title="Remover ponto"
                                        ></i>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* CARD 4: MAPA */}
            <div className="card-custom p-0 overflow-hidden" style={{height: '500px'}}>
                <MapContainer center={[-23.5505, -46.6333]} zoom={10} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    <MapAutoFit bounds={allBounds} />

                    {routePath.length > 0 && (
                        <Polyline positions={routePath} color="#0056b3" weight={5} opacity={0.7} />
                    )}

                    {points.map((pt, idx) => {
                        let color = "blue";
                        // Recalcula a cor no mapa também caso remova pontos
                        if (idx === 0) color = "red";
                        else if (idx === points.length - 1) color = "green";

                        return (
                            <CircleMarker 
                                key={pt.id}
                                center={[pt.lat, pt.lng]}
                                radius={idx === 0 || idx === points.length - 1 ? 9 : 6}
                                pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 1, weight: 2 }}
                            >
                                <Popup>
                                    <strong>{pt.name}</strong><br/>
                                    {idx === 0 ? "Início" : idx === points.length - 1 ? "Fim" : "Parada"}
                                </Popup>
                            </CircleMarker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
};

export default RouteCreate;
