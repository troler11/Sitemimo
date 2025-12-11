import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/api';
import MapModal from '../components/MapModal';
import { useAuth } from '../hooks/useAuth'; 

// Importante: Importar o CSS atualizado
import './Dashboard.css';

interface Linha {
    id: string;
    e: string;  // Empresa
    r: string;  // Rota
    v: string;  // Veículo
    s: number;  // Sentido
    pi: string; // Prev. Início
    ri: string; // Real Início
    pf: string; // Prog. Fim
    pfn?: string; 
    u: string;  // Update (Ult. Reporte)
    c: string;  
}

// Tipo para controle de ordenação
type SortConfig = {
    key: keyof Linha; // Chave pela qual vamos ordenar
    direction: 'asc' | 'desc';
} | null;

function isLineAtrasada(l: Linha): boolean {
    const tolerancia = 10;
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;
    
    const timeToMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    
    const progMin = timeToMinutes(l.pi);
    const realMin = timeToMinutes(l.ri);

    return (realMin - progMin) > tolerancia;
}

const Dashboard: React.FC = () => {
    const { isLoggedIn, isInitializing, logout } = useAuth();
    const navigate = useNavigate();
    
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const [horaServidor, setHoraServidor] = useState('00:00');
    
    const [busca, setBusca] = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroSentido, setFiltroSentido] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    // Estado para ordenação
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string, pfn: string
    } | null>(null);

    const linhasRef = useRef(linhas);
    const isMountedRef = useRef(true);

    useEffect(() => { linhasRef.current = linhas; }, [linhas]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!isInitializing && !isLoggedIn) {
            navigate('/login');
        }
    }, [isInitializing, isLoggedIn, navigate]);

    const fetchData = useCallback(async () => {
        if (!isLoggedIn) return;
        try {
            const res = await api.get('/dashboard');
            const linhasServidor: Linha[] = res.data.todas_linhas || [];
            
            setLinhas(prevLinhas => {
                if (prevLinhas.length === 0) return linhasServidor;
                return linhasServidor.map(serverLinha => {
                    const linhaAnterior = prevLinhas.find(l => l.id === serverLinha.id);
                    if (!serverLinha.pfn && linhaAnterior?.pfn) {
                        return { ...serverLinha, pfn: linhaAnterior.pfn };
                    }
                    return serverLinha;
                });
            });

            if(res.data.hora) setHoraServidor(res.data.hora);
            setLoading(false);
        } catch (error: any) {
            console.error("Erro dashboard:", error);
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                logout();
                navigate('/login');
            }
        }
    }, [isLoggedIn, logout, navigate]);

    const carregarPrevisoesAutomaticamente = useCallback(async () => {
        if (!isLoggedIn) return;
        const linhasAtivas = linhasRef.current.filter(l => 
            l.ri && l.ri !== 'N/D' && 
            l.c !== 'Carro desligado' && 
            l.c !== 'Encerrado' && l.v
        );

        if (linhasAtivas.length === 0) return;
        const BATCH_SIZE = 5;
        for (let i = 0; i < linhasAtivas.length; i += BATCH_SIZE) {
            if (!isMountedRef.current) break; 
            const batch = linhasAtivas.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (linha) => {
                try {
                    const cacheBuster = Date.now();
                    const url = `/rota/final/${encodeURIComponent(linha.v)}`;
                    const res = await api.get(url, { params: { idLinha: linha.id, cache: cacheBuster } });
                    const novaPrevisao: string = res.data.previsao_chegada;
                    
                    if (novaPrevisao && novaPrevisao !== 'N/D') {
                        setLinhas(prevLinhas => prevLinhas.map(item => 
                            item.id === linha.id ? { ...item, pfn: novaPrevisao } : item
                        ));
                    }
                } catch (err: any) { }
            });
            await Promise.allSettled(promises);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
            const intervalPrincipal = setInterval(fetchData, 30000);
            return () => clearInterval(intervalPrincipal);
        }
    }, [isLoggedIn, fetchData]);

    useEffect(() => {
        if (isLoggedIn && !loading && linhas.length > 0) {
            carregarPrevisoesAutomaticamente(); 
            const intervalPrevisao = setInterval(() => {
                carregarPrevisoesAutomaticamente();
            }, 120000);
            return () => clearInterval(intervalPrevisao);
        }
    }, [isLoggedIn, loading, linhas.length, carregarPrevisoesAutomaticamente]);

    const empresasUnicas = useMemo(() => [...new Set(linhas.map(l => l.e).filter(Boolean))].sort(), [linhas]);

    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            if (busca) {
                const termo = busca.toLowerCase();
                const textoLinha = `${l.e || ''} ${l.r || ''} ${l.v || ''}`.toLowerCase();
                if (!textoLinha.includes(termo)) return false;
            }
            if (filtroEmpresa && l.e !== filtroEmpresa) return false;
            if (filtroSentido) {
               const sentidoReal = Number(l.s) === 1 ? 'ida' : 'volta';
                if (filtroSentido !== sentidoReal) return false;
            }
            if (filtroStatus) {
                const atrasado = isLineAtrasada(l);
                if (filtroStatus === 'atrasado' && !atrasado) return false;
                if (filtroStatus === 'pontual' && atrasado) return false;
            }
            return true;
        });
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus]);

    // --- NOVA LÓGICA DE ORDENAÇÃO (CORRIGIDA) ---
    const dadosOrdenados = useMemo(() => {
        let sortableItems = [...dadosFiltrados];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                // CORREÇÃO: O '??' garante que se for undefined, vira '' (string vazia)
                // Isso satisfaz o TypeScript que reclamava de 'undefined'
                const aValue = a[sortConfig.key] ?? '';
                const bValue = b[sortConfig.key] ?? '';

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [dadosFiltrados, sortConfig]);

    // Função para clicar no header
    const requestSort = (key: keyof Linha) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Helper para mostrar ícone
    const getSortIcon = (name: keyof Linha) => {
        if (!sortConfig || sortConfig.key !== name) {
            return <i className="fas fa-sort text-muted ms-1" style={{fontSize:'0.7em', opacity: 0.3}}></i>;
        }
        return sortConfig.direction === 'asc' 
            ? <i className="fas fa-sort-up ms-1"></i> 
            : <i className="fas fa-sort-down ms-1"></i>;
    };
    // --------------------------------

    const kpis = useMemo(() => {
        let counts = { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
        linhas.forEach(l => {
            counts.total++;
            if (l.c === 'Carro desligado') { counts.desligados++; return; }
            const jaSaiu = l.ri && l.ri !== 'N/D';
            if (jaSaiu) {
                if (isLineAtrasada(l)) counts.atrasados++; else counts.pontual++;
            } else {
                if (l.pi < horaServidor) counts.semInicio++; else counts.deslocamento++;
            }
        });
        return counts;
    }, [linhas, horaServidor]);

    const getPrevisaoInteligente = (linha: Linha) => {
        const temTomTom = linha.pfn && linha.pfn !== 'N/D';
        const horarioExibicao = temTomTom ? linha.pfn : linha.pf;
        let classeCor = 'text-dark';
        
        if (temTomTom && linha.pf) {
            if (linha.pfn! > linha.pf) classeCor = 'text-danger fw-bold'; 
            else classeCor = 'text-success fw-bold';
        } else if (!temTomTom) {
            classeCor = 'text-muted';
        }
        return { horario: horarioExibicao, classe: classeCor, origem: temTomTom ? 'TomTom' : 'Tabela' };
    };

    if (isInitializing || !isLoggedIn) return null;

    return (
        <div className="main-content">
            {/* Header com Busca */}
            <div className="header-flex mb-4">
                <h2 className="page-title">Visão Geral da Frota ({horaServidor})</h2>
                <div className="search-wrapper">
                    <input 
                        type="text" 
                        className="form-control red-border" 
                        placeholder="Busca por veículo ou rota..." 
                        value={busca} 
                        onChange={e => setBusca(e.target.value)} 
                    />
                </div>
            </div>

            {/* Filtros */}
            <div className="filters-flex mb-4">
                <select className="form-select red-border" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                    <option value="">Todas as Empresas</option>
                    {empresasUnicas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                </select>
                <select className="form-select red-border" value={filtroSentido} onChange={e => setFiltroSentido(e.target.value)}>
                    <option value="">Sentido: Todos</option>
                    <option value="ida">Entrada</option>
                    <option value="volta">Saida</option>
                </select>
                <select className="form-select red-border" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                    <option value="">Status: Todos</option>
                    <option value="atrasado">Atrasados</option>
                    <option value="pontual">Pontual</option>
                </select>
            </div>

            {/* KPI Cards */}
            <div className="kpi-row mb-4">
                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">TOTAL</span><span className="kpi-number text-red">{kpis.total}</span></div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">ATRASADOS</span><span className="kpi-number text-red">{kpis.atrasados}</span></div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon text-green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">PONTUAL</span><span className="kpi-number text-green">{kpis.pontual}</span></div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon text-dark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">DESLIGADOS</span><span className="kpi-number text-dark">{kpis.desligados}</span></div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">DESLOCAMENTO</span><span className="kpi-number text-red">{kpis.deslocamento}</span></div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon text-dark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
                    </div>
                    <div className="kpi-info"><span className="kpi-label">NÃO INICIOU</span><span className="kpi-number text-dark">{kpis.semInicio}</span></div>
                </div>
            </div>

            {/* Tabela com Ordenação */}
            <div className="table-responsive table-card">
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th onClick={() => requestSort('e')} style={{cursor:'pointer'}}>Empresa {getSortIcon('e')}</th>
                            <th onClick={() => requestSort('r')} style={{cursor:'pointer'}}>Rota {getSortIcon('r')}</th>
                            <th onClick={() => requestSort('s')} style={{cursor:'pointer'}}>Sentido {getSortIcon('s')}</th>
                            <th onClick={() => requestSort('v')} style={{cursor:'pointer'}}>Veículo {getSortIcon('v')}</th>
                            <th onClick={() => requestSort('pi')} style={{cursor:'pointer'}}>Prev. Ini {getSortIcon('pi')}</th>
                            <th onClick={() => requestSort('ri')} style={{cursor:'pointer'}}>Real Início {getSortIcon('ri')}</th>
                            <th onClick={() => requestSort('pf')} style={{cursor:'pointer'}}>Prog. Fim {getSortIcon('pf')}</th>
                            <th>Prev. Fim (Real)</th>
                            <th onClick={() => requestSort('u')} style={{cursor:'pointer'}}>Ult. Reporte {getSortIcon('u')}</th>
                            <th>Status</th>
                            <th className="text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={11} className="text-center py-4">Carregando dados da frota...</td></tr>
                        ) : dadosOrdenados.map((l, idx) => { // Usando dadosOrdenados
                            const previsao = getPrevisaoInteligente(l);
                            const valSentido = Number(l.s);
                            const jaSaiu = l.ri && l.ri !== 'N/D';

                            let statusBadge;
                            if (l.c === 'Carro desligado') statusBadge = <span className="badge badge-gray">Desligado</span>;
                            else if (!jaSaiu) statusBadge = l.pi < horaServidor ? <span className="badge badge-red">Atrasado (Ini)</span> : <span className="badge badge-gray">Aguardando</span>;
                            else statusBadge = isLineAtrasada(l) ? <span className="badge badge-red">Atrasado</span> : <span className="badge badge-green">Pontual</span>;

                            return (
                                <tr key={`${l.id}-${idx}`}>
                                    <td>{l.e}</td>
                                    <td className="text-truncate" style={{maxWidth: '220px'}} title={l.r}>{l.r}</td>
                                    <td>{valSentido === 1 ? 'Entrada' : 'Saida'}</td>
                                    <td className="fw-bold text-red">{l.v}</td>
                                    <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger' : ''}>{l.pi}</td>
                                    <td>{l.ri}</td>
                                    <td>{l.pf}</td>
                                    <td className={previsao.classe}>
                                        {previsao.horario || 'N/D'}
                                        {previsao.origem === 'TomTom' && <i className="fas fa-broadcast-tower ms-1 small blink-icon" title="TomTom"></i>}
                                    </td>
                                    <td>{l.u}</td>
                                    <td>{statusBadge}</td>
                                    <td className="text-center">
                                        <div className="d-flex justify-content-center gap-2">
                                            <button className="btn-action-outline" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi || '--:--', pfn: l.ri || '--:--' })}>
                                                <i className="far fa-clock"></i>
                                            </button>
                                            <button className="btn-action-outline" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf || 'N/D', pfn: previsao.horario || 'N/D' })}>
                                                <i className="fas fa-map-marker-alt"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selectedMap && (
                <MapModal 
                    placa={selectedMap.placa} 
                    idLinha={selectedMap.idLinha} 
                    tipo={selectedMap.tipo}
                    pf={selectedMap.pf}
                    pfn={selectedMap.pfn}
                    onClose={() => setSelectedMap(null)} 
                />
            )}
        </div>
    );
};

export default Dashboard;
