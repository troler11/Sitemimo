import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import MapModal from '../components/MapModal';

interface Linha {
    id: string;
    e: string; // empresa
    r: string; // rota
    v: string; // veiculo
    s: number; // sentido
    pi: string; // prog inicio
    ri: string; // real inicio
    pf: string; // prog fim
    pfn?: string; // Previsão TomTom
    u: string;  // update
    c: string;  // categoria
}

const Dashboard: React.FC = () => {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const [horaServidor, setHoraServidor] = useState('00:00');
    
    const [busca, setBusca] = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroSentido, setFiltroSentido] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string 
    } | null>(null);

    const fetchData = async () => {
        try {
            const res = await api.get('/dashboard');
            setLinhas(res.data.todas_linhas);
            if(res.data.hora) setHoraServidor(res.data.hora);
            setLoading(false);
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); 
        return () => clearInterval(interval);
    }, []);

    // --- CÁLCULO DE KPIS ---
    const kpis = useMemo(() => {
        let counts = { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
        linhas.forEach(l => {
            counts.total++;
            if (l.c === 'Carro desligado') { counts.desligados++; return; }
            const jaSaiu = l.ri && l.ri !== 'N/D';
            if (jaSaiu) {
                if (isLineAtrasada(l)) counts.atrasados++;
                else counts.pontual++;
            } else {
                if (l.pi < horaServidor) counts.semInicio++;
                else counts.deslocamento++;
            }
        });
        return counts;
    }, [linhas, horaServidor]);

    // --- LÓGICA DE PREVISÃO ---
    const getDisplayPrevisao = (linha: Linha) => {
        const temTomTom = linha.pfn && linha.pfn !== 'N/D' && linha.pfn !== '--:--' && linha.pfn !== '';
        const horarioFinal = temTomTom ? linha.pfn : linha.pf;
        let classeCor = 'text-muted';
        if (temTomTom && linha.pf) {
            classeCor = (linha.pfn! > linha.pf) ? 'text-danger fw-bold' : 'text-success fw-bold';
        }
        return { horario: horarioFinal, classe: classeCor, origem: temTomTom ? 'TomTom' : 'Prog' };
    };

    // --- FILTROS ---
    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            if (busca && !`${l.e} ${l.r} ${l.v}`.toLowerCase().includes(busca.toLowerCase())) return false;
            if (filtroEmpresa && l.e !== filtroEmpresa) return false;
            if (filtroSentido) {
                const sentidoStr = Number(l.s) === 1 ? 'ida' : 'volta';
                if (filtroSentido !== sentidoStr) return false;
            }
            if (filtroStatus) {
                const atrasado = isLineAtrasada(l);
                if (filtroStatus === 'atrasado' && !atrasado) return false;
                if (filtroStatus === 'pontual' && atrasado) return false;
            }
            return true;
        });
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus]);

    const empresasUnicas = useMemo(() => [...new Set(linhas.map(l => l.e).filter(Boolean))].sort(), [linhas]);

    return (
        <div className="container-fluid pt-3">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-dark mb-1">Visão Geral da Frota ({horaServidor})</h4>
                <input type="text" className="form-control w-25" placeholder="Busca..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>

            <div className="row g-2 mb-4">
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                        <option value="">Todas Empresas</option>
                        {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroSentido} onChange={e => setFiltroSentido(e.target.value)}>
                        <option value="">Sentido: Todos</option>
                        <option value="ida">IDA</option>
                        <option value="volta">VOLTA</option>
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="atrasado">Atrasados</option>
                        <option value="pontual">Pontual</option>
                    </select>
                </div>
            </div>

            {/* CARDS / KPIS */}
            <div className="row g-3 mb-4">
                <div className="col-md-2"><div className="card p-3 text-center bg-primary text-white"><h5>{kpis.total}</h5><small>Total</small></div></div>
                <div className="col-md-2"><div className="card p-3 text-center bg-danger text-white"><h5>{kpis.atrasados}</h5><small>Atrasados</small></div></div>
                <div className="col-md-2"><div className="card p-3 text-center bg-success text-white"><h5>{kpis.pontual}</h5><small>Pontual</small></div></div>
                <div className="col-md-2"><div className="card p-3 text-center bg-secondary text-white"><h5>{kpis.desligados}</h5><small>Desligados</small></div></div>
                <div className="col-md-2"><div className="card p-3 text-center bg-info text-white"><h5>{kpis.deslocamento}</h5><small>Em Rota</small></div></div>
                <div className="col-md-2"><div className="card p-3 text-center bg-warning text-dark"><h5>{kpis.semInicio}</h5><small>Não Iniciou</small></div></div>
            </div>

            <div className="card border-0 shadow-sm">
                <div className="table-responsive">
                    <table className="table table-hover table-sm align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>Empresa</th>
                                <th>Rota</th>
                                <th>Veículo</th>
                                <th>Prev. Ini</th>
                                <th>Real Início</th>
                                <th>Prog. Fim</th>
                                <th>Prev. Chegada</th>
                                <th>Status</th>
                                <th className="text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan={9}>Carregando...</td></tr> : dadosFiltrados.map((l, idx) => {
                                const jaSaiu = l.ri && l.ri !== 'N/D';
                                const atrasado = isLineAtrasada(l);
                                const previsao = getDisplayPrevisao(l);
                                
                                return (
                                    <tr key={`${l.id}-${idx}`}>
                                        <td>{l.e}</td>
                                        <td>{l.r} {Number(l.s) === 1 ? '➡️' : '⬅️'}</td>
                                        <td className="fw-bold text-primary">{l.v}</td>
                                        <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger' : ''}>{l.pi}</td>
                                        <td>{l.ri}</td>
                                        <td className="text-muted small">{l.pf}</td>
                                        
                                        <td className={previsao.classe}>
                                            {previsao.horario || 'N/D'}
                                            {previsao.origem === 'TomTom' && <i className="bi bi-broadcast ms-1 small"></i>}
                                        </td>

                                        <td>
                                            {l.c === 'Carro desligado' ? <span className="badge bg-secondary">Desligado</span> :
                                             !jaSaiu ? <span className="badge bg-light text-dark border">Aguardando</span> :
                                             atrasado ? <span className="badge bg-danger">Atrasado</span> : 
                                             <span className="badge bg-success">Pontual</span>}
                                        </td>
                                        
                                        <td className="text-center">
                                            {/* CORREÇÃO DO ONCLICK: Adicionado || 'N/D' para satisfazer TypeScript */}
                                            <button className="btn btn-primary btn-sm rounded-circle" style={{width:24, height:24}}
                                                onClick={() => setSelectedMap({
                                                    placa: l.v, 
                                                    idLinha: l.id, 
                                                    tipo: 'final', 
                                                    pf: previsao.horario || 'N/D' 
                                                })}
                                            >
                                                <i className="bi bi-geo-alt-fill" style={{fontSize: 10}}></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedMap && (
                <MapModal 
                    placa={selectedMap.placa} 
                    idLinha={selectedMap.idLinha} 
                    tipo={selectedMap.tipo}
                    pf={selectedMap.pf}
                    onClose={() => setSelectedMap(null)} 
                />
            )}
        </div>
    );
};

function isLineAtrasada(l: Linha): boolean {
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;
    const [hP, mP] = l.pi.split(':').map(Number);
    const [hR, mR] = l.ri.split(':').map(Number);
    return (hR * 60 + mR) - (hP * 60 + mP) > 10;
}

export default Dashboard;
