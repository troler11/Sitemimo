import React, { useEffect, useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import MapModal from '../components/MapModal';
import { useNavigate } from 'react-router-dom';

interface Linha {
    id: string;
    e: string; // empresa
    r: string; // rota
    v: string; // veiculo
    pi: string; // prog inicio
    ri: string; // real inicio
    status_tempo: string;
}

const Dashboard: React.FC = () => {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [selectedMap, setSelectedMap] = useState<{placa: string, idLinha: string, tipo: 'inicial'|'final'} | null>(null);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
          if (!token) return navigate('/login');

           const res = await api.get('/dashboard');
           setLinhas(res.data.todas_linhas);
            setLoading(false);
        } catch (error) {
            console.error("Erro ao carregar dashboard", error);
        }
    };

    // Polling a cada 30 segundos (substitui o setInterval do PHP/JS)
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="spinner-border text-primary">Carregando...</div>;

    return (
        <div className="container-fluid">
            <h4 className="mt-4">Visão Geral da Frota</h4>
            <div className="table-responsive">
                <table className="table table-hover table-sm">
                    <thead>
                        <tr>
                            <th>Empresa</th>
                            <th>Rota</th>
                            <th>Veículo</th>
                            <th>Prog. Início</th>
                            <th>Real Início</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                       {linhas.map((l, idx) => (
                           <tr key={idx}>
                                <td>{l.e}</td>
                                <td>{l.r}</td>
                                <td className="fw-bold text-primary">{l.v}</td>
                                <td>{l.pi}</td>
                                <td>{l.ri}</td>
                                <td>
                                    {/* Exemplo de renderização condicional baseada na sua lógica PHP */}
                                    {l.status_tempo === 'atrasado' ? (
                                        <span className="badge bg-danger">Atrasado</span>
                                    ) : (
                                        <span className="badge bg-success">Pontual</span>
                                    )}
                                </td>
                               <td>
                                <button 
                                    className="btn btn-sm btn-outline-primary rounded-circle me-1"
                                    onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'inicial' })}
                                    title="Previsão Chegada Inicial"
                                >
                                    <i className="bi bi-clock"></i>
                                </button>
                                <button 
                                    className="btn btn-sm btn-primary rounded-circle"
                                    onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'final' })}
                                    title="Previsão Destino Final"
                                >
                                    <i className="bi bi-geo-alt-fill"></i>
                                </button>
                            </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {/* Renderização Condicional do Modal */}
            {selectedMap && (
                <MapModal 
                    placa={selectedMap.placa} 
                    idLinha={selectedMap.idLinha} 
                    tipo={selectedMap.tipo} 
                    onClose={() => setSelectedMap(null)} 
                />
            )}
            </div>
        </div>
    );
};

export default Dashboard;
