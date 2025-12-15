import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression, LatLngTuple } from 'leaflet';
import Swal from 'sweetalert2';
import { useNavigate, useParams } from 'react-router-dom'; // Adicionado useParams
import api from '../services/api';
import 'leaflet/dist/leaflet.css';
import './RouteCreate.css';

// --- Interfaces ---
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
    empresa: string;
    diasOperacao: boolean[]; 
}

const MapAutoFit = ({ bounds }: { bounds: LatLngExpression[] }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds.length > 0) {
            const boundsObj = L.latLngBounds(bounds as LatLngTuple[]);
            map.fitBounds(boundsObj, { padding: [50, 50], maxZoom: 15 });
        }
    }, [bounds, map]);
    return null;
};

const RouteCreate: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams(); // Pega o ID da URL (se existir)
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isEditing = !!id; // Boolean: true se estiver editando

    const [form, setForm] = useState<RotaForm>({
        descricao: '',
        codigo: '',
        sentido: 'entrada',
        cliente: 'PACKTEC',
        empresa: '', 
        diasOperacao: [false, true, true, true, true, true, false] 
    });
    
    const [points, setPoints] = useState<PontoParada[]>([]);
    const [routePath, setRoutePath] = useState<LatLngExpression[]>([]);
    const [allBounds, setAllBounds] = useState<LatLngExpression[]>([]);
    const [loading, setLoading] = useState(false);

    // --- CARREGAR DADOS NA EDIÇÃO ---
    useEffect(() => {
        if (isEditing) {
            fetchRotaData();
        }
    }, [id]);

    const fetchRotaData = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/rotas/${id}`);
            const data = response.data;

            // 1. Preenche o Formulário
            setForm({
                descricao: data.descricao,
                codigo: data.codigo,
                sentido: data.sentido,
                cliente: data.cliente,
                empresa: data.empresa,
                // O banco manda snake_case (dias_operacao), convertemos para state camelCase
                diasOperacao: data.dias_operacao || [false, true, true, true, true, true, false]
            });

            // 2. Preenche o Traçado (Linha Azul)
            if (data.tracado_completo && Array.isArray(data.tracado_completo)) {
                setRoutePath(data.tracado_completo);
                setAllBounds(data.tracado_completo); // Ajusta zoom
            }

            // 3. Preenche os Pontos
            if (data.pontos && Array.isArray(data.pontos)) {
                const pontosMapeados = data.pontos.map((p: any) => ({
                    id: Date.now() + Math.random(), // ID temporário para o React Key
                    name: p.nome,
                    time: p.horario,
                    lat: parseFloat(p.latitude),
                    lng: parseFloat(p.longitude),
                    type: p.tipo
                }));
                setPoints(pontosMapeados);
            }

        } catch (error) {
            console.error("Erro ao carregar rota", error);
            Swal.fire("Erro", "Não foi possível carregar os dados da rota.", "error");
            navigate('/rotas');
        } finally {
            setLoading(false);
        }
    };

    const diasSemanaLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const toggleDia = (index: number) => {
        setForm(prev => {
            const novosDias = [...prev.diasOperacao];
            novosDias[index] = !novosDias[index]; 
            return { ...prev, diasOperacao: novosDias };
        });
    };

    // --- Lógica de KML (Mantida) ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            processKML(ev.target?.result as string);
        };
        reader.readAsText(file);
    };

    const processKML = (xmlString: string) => {
        // ... (Mesma lógica de antes para processar KML) ...
        // Vou resumir para não estourar o limite de caracteres, 
        // mas mantenha o código do processKML que te enviei na resposta anterior
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const newPoints: PontoParada[] = [];
        const newRoutePath: LatLngExpression[] = [];
        const bounds: LatLngExpression[] = [];

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
        const placemarks = xmlDoc.getElementsByTagName("Placemark");
        for (let i = 0; i < placemarks.length; i++) {
            if (placemarks[i].getElementsByTagName("LineString").length > 0) continue;
            const name = placemarks[i].getElementsByTagName("name")[0]?.textContent || "Ponto";
            const pointTag = placemarks[i].getElementsByTagName("Point")[0];
            if (pointTag) {
                const coords = pointTag.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (coords) {
                    const [lngStr, latStr] = coords.split(',');
                    newPoints.push({
                        id: Date.now() + i,
                        name: name,
                        time: '00:00',
                        lat: parseFloat(latStr),
                        lng: parseFloat(lngStr),
                        type: 'PARADA'
                    });
                    bounds.push([parseFloat(latStr), parseFloat(lngStr)]);
                }
            }
        }
        if (newPoints.length > 0) {
            newPoints[0].type = 'INICIAL';
            newPoints[newPoints.length - 1].type = 'FINAL';
        }
        setRoutePath(newRoutePath);
        setPoints(newPoints);
        setAllBounds(bounds);
    };

    const updatePoint = (id: number, field: 'name' | 'time', value: string) => {
        setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

   const removePoint = (id: number) => {
    // Remove o ponto da lista visual
    setPoints(prev => prev.filter(p => p.id !== id));
};;

    // --- Salvar / Atualizar ---
    const handleSave = async () => {
        if (!form.descricao || !form.codigo || !form.empresa) {
            Swal.fire('Campos obrigatórios', 'Preencha Descrição, Código e Empresa.', 'warning');
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
            tracado_completo: routePath
        };

        try {
            if (isEditing) {
                // MODO EDIÇÃO (PUT)
                await api.put(`/rotas/${id}`, payload);
                Swal.fire('Atualizado!', 'Rota editada com sucesso.', 'success');
            } else {
                // MODO CRIAÇÃO (POST)
                await api.post('/rotas', payload);
                Swal.fire('Sucesso!', 'Rota cadastrada com sucesso.', 'success');
            }
            navigate('/rotas'); // Volta para a lista
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
                <small className="text-muted">
                    Rotas &gt; {isEditing ? `Editando: ${form.codigo}` : 'Nova Rota'}
                </small>
                <div className="d-flex align-items-center gap-3">
                    <button 
                        className="btn btn-abm-green shadow-sm" 
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? 'SALVANDO...' : (
                            <><i className="fas fa-save me-2"></i> {isEditing ? 'ATUALIZAR DADOS' : 'SALVAR NO BANCO'}</>
                        )}
                    </button>
                </div>
            </div>

            {/* CARD 1: FORMULÁRIO */}
            <div className="card-custom">
                <h6 className="section-title">Informações da Linha</h6>
                
                <div className="row mb-3">
                    <div className="col-md-6">
                        <label>Descrição</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Ex: CAMPI - CENTRO (06:00)"
                            value={form.descricao} 
                            onChange={e => setForm({...form, descricao: e.target.value})}
                        />
                    </div>
                    <div className="col-md-3">
                        <label>Código</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            value={form.codigo}
                            onChange={e => setForm({...form, codigo: e.target.value})}
                        />
                    </div>
                    <div className="col-md-3">
                        <label>Empresa</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            value={form.empresa}
                            onChange={e => setForm({...form, empresa: e.target.value})}
                        />
                    </div>
                </div>

                <div className="row mb-3 align-items-end">
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
                        <label>Cliente</label>
                        <select 
                            className="form-select" 
                            value={form.cliente}
                            onChange={e => setForm({...form, cliente: e.target.value})}
                        >
                            <option value="PACKTEC">PACKTEC</option>
                            <option value="MERCADO_LIVRE">MERCADO LIVRE</option>
                            <option value="OUTRO">OUTRO</option>
                        </select>
                    </div>
                    
                    <div className="col-md-7">
                        <label className="d-block">Dias de Operação</label>
                        <div className="btn-group w-100" role="group">
                            {diasSemanaLabel.map((dia, index) => (
                                <button
                                    key={dia}
                                    type="button"
                                    className={`btn btn-sm ${form.diasOperacao[index] ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => toggleDia(index)}
                                >
                                    {dia}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* CARD 2: IMPORTAÇÃO (Só exibe se quiser reimportar KML, mas é útil manter) */}
            <div className="card-custom bg-light border-danger border-start border-4">
                <div className="row align-items-center">
                    <div className="col-md-8">
                        <h6 className="mb-2">Importar Rota e Traçado (KML)</h6>
                        <p className="text-muted small mb-0">
                            {isEditing 
                                ? "Importar um novo KML substituirá os pontos e traçado atuais." 
                                : "O sistema desenhará o trajeto exato e os pontos de parada."}
                        </p>
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
                        <p className="text-center text-muted p-4">Nenhum ponto definido.</p>
                    ) : (
                        points.map((pt, idx) => {
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
                                    <div className="col-md-1 col-center">
        <i 
            className="fas fa-trash-alt icon-trash" 
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
