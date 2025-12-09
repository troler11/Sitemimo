import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import MapModal from '../components/MapModal';

interface Linha {
    id: string;
    e: string; // empresa
    r: string; // rota
    v: string; // veiculo
    s: number; // sentido (1=ida, 0=volta)
    pi: string; // prog inicio
    ri: string; // real inicio
    pf: string; // prog fim
    pfn?: string; // Previsão Fim Nova (Calculada pelo Backend)
    u: string;  // ultima atualizacao
    c: string;  // categoria (status)
}

const Dashboard: React.FC = () => {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const [horaServidor, setHoraServidor] = useState('00:00');
    
    // Filtros
    const [busca, setBusca] = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroSentido, setFiltroSentido] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    // Modal de Mapa
    const [selectedMap, setSelectedMap] = useState<{placa: string, idLinha: string, tipo: 'inicial'|'final'} | null>(null);

    const navigate = useNavigate();

    const fetchData = async () => {
        try {
            const res = await api.get('/dashboard');
            setLinhas(res.data.todas_linhas);
            if(res.data.hora) setHoraServidor(res.data.hora);
            setLoading(false);
        } catch (error) {
            console.error("Erro dashboard", error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    // --- LÓGICA DE DADOS (KPIs e Filtros) ---
    
    const empresasUnicas = useMemo(() => {
        const lista = new Set(linhas.map(l => l.e).filter(Boolean));
        return Array.from(lista).sort();
    }, [linhas]);

    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            // Busca Texto
            if (busca) {
                const termo = busca.toLowerCase();
                const textoLinha = `${l.e} ${l.r} ${l.v}`.toLowerCase();
                if (!textoLinha.includes(termo)) return false;
            }
            // Filtro Empresa
            if (filtroEmpresa && l.e !== filtroEmpresa) return false;
            // Filtro Sentido
            if (filtroSentido) {
                const sentidoStr = l.s ? 'ida' : 'volta';
                if (filtroSentido !== sentidoStr) return false;
            }
            // Filtro Status
            if (filtroStatus) {
                const isAtrasado = isLineAtrasada(l, horaServidor);
                if (filtroStatus === 'atrasado' && !isAtrasado) return false;
                if (filtroStatus === 'pontual' && isAtrasado) return false;
            }
            return true;
        });
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus, horaServidor]);

    const kpis = useMemo(() => {
        let counts = { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
        linhas.forEach(l => {
            counts.total++;
            if (l.c === 'Carro desligado') { counts.desligados++; return; }
            
            const atrasado = isLineAtrasada(l, horaServidor);
            if (atrasado) counts.atrasados++;
            else if (l.ri !== 'N/D') counts.pontual++;
            else counts.semInicio++;
            
            if (l.ri !== 'N/D') counts.deslocamento++; 
        });
        return counts;
    }, [linhas, horaServidor]);

    // Helper para cor da previsão
    const getCorPrevisao = (prev?: string, prog?: string) => {
        if (!prev || prev === 'N/D' || !prog || prog === 'N/D') return '';
        // Se a previsão é maior que o programado = Atrasado (Vermelho)
        if (prev > prog) return 'text-danger fw-bold'; 
        // Se é menor ou igual = No horário (Verde)
        return 'text-success fw-bold';
    };

    // --- RENDERIZAÇÃO ---

    return (
        <div className="container-fluid pt-3">
            {/* 1. Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h4 className="fw-bold text-dark mb-1">Visão Geral da Frota</h4>
                    <p className="text-muted small mb-0">
                        <span className="badge bg-light text-secondary border me-2">Online</span>
                        Última atualização: <strong>{horaServidor}</strong>
                    </p>
                </div>
                
                <div className="d-flex gap-2 w-50 justify-content-end align-items-center">
                    <div className="position-relative w-50">
                        <i className="bi bi-search search-icon"></i>
                        <input 
                            type="text" 
                            className="form-control search-bar" 
                            placeholder="Busca Inteligente..."
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* 2. Barra de Filtros */}
            <div className="filter-bar">
                <div className="row g-2 align-items-center">
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Empresa:</label>
                        <select className="form-select form-select-sm" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                            <option value="">Todas as Empresas</option>
                            {empresasUnicas.map(emp => (
                                <option key={emp} value={emp}>{emp}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Sentido:</label>
                        <select className="form-select form-select-sm" value={filtroSentido} onChange={e => setFiltroSentido(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="ida">➡️ IDA</option>
                            <option value="volta">⬅️ VOLTA</option>
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Status:</label>
                        <select className="form-select form-select-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="atrasado">🚨 Atrasados</option>
                            <option value="pontual">✅ Pontual</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 3. Cards de KPI */}
            <div className="row g-3 mb-4">
                <div className="col-md-2"><div className="card-summary card-blue"><h5>Total</h5><h3>{kpis.total}</h3></div></div>
                <div className="col-md-2"><div className="card-summary card-red"><h5>Atrasados</h5><h3>{kpis.atrasados}</h3></div></div>
                <div className="col-md-2"><div className="card-summary card-green"><h5>Pontual</h5><h3>{kpis.pontual}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-secondary"><h5>Desligados</h5><h3>{kpis.desligados}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-info"><h5>Em Deslocamento</h5><h3>{kpis.deslocamento}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-warning"><h5>Não Iniciou</h5><h3>{kpis.semInicio}</h3></div></div>
            </div>

            {/* 4. Tabela de Dados */}
            <div className="card border-0 shadow-sm">
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-hover table-sm table-ultra-compact align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th>Empresa</th>
                                    <th>Rota</th>
                                    <th>Veículo</th>
                                    <th className="col-narrow">Prev. Ini</th>
                                    <th>Prog. Início</th>
                                    <th>Real Início</th>
                                    <th>Prog. Fim</th>
                                    <th title="Previsão de Chegada">Prev. Fim</th> {/* Coluna Restaurada */}
                                    <th>Ult. Reporte</th>
                                    <th>Status</th>
                                    <th className="text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}>
                                            <td colSpan={11}><div className="skeleton skeleton-text"></div></td>
                                        </tr>
                                    ))
                                ) : dadosFiltrados.length === 0 ? (
                                    <tr><td colSpan={11} className="text-center py-4 text-muted">Nenhum veículo encontrado.</td></tr>
                                ) : (
                                    dadosFiltrados.map((l, idx) => {
                                        const atrasado = isLineAtrasada(l, horaServidor);
                                        const iconSentido = l.s ? <i className="bi bi-arrow-right-circle-fill text-primary ms-1" title="IDA"></i> : <i className="bi bi-arrow-left-circle-fill text-warning ms-1" title="VOLTA"></i>;
                                        
                                        // Calcula cor da Previsão Fim
                                        const classPrevFim = getCorPrevisao(l.pfn, l.pf);

                                        return (
                                            <tr key={`${l.id}-${idx}`}>
                                                <td>{l.e}</td>
                                                <td>{l.r} {iconSentido}</td>
                                                <td className="fw-bold text-primary">{l.v}</td>
                                                <td className="text-muted small">--:--</td>
                                                <td className={atrasado ? 'text-danger fw-bold' : ''}>{l.pi}</td>
                                                <td>{l.ri}</td>
                                                
                                                {/* Prog Fim */}
                                                <td><strong>{l.pf}</strong></td>
                                                
                                                {/* Prev Fim (Dados do Backend + Cor Lógica) */}
                                                <td className={classPrevFim}>{l.pfn || 'N/D'}</td>
                                                
                                                <td className="small">{l.u}</td>
                                                <td>
                                                    {l.c === 'Carro desligado' ? <span className="badge bg-secondary badge-pill">Desligado</span> :
                                                     l.ri === 'N/D' ? (atrasado ? <span className="badge bg-danger badge-pill blink-animation">Atrasado (Inicial)</span> : <span className="badge bg-light text-dark border badge-pill">Aguardando</span>) :
                                                     atrasado ? <span className="badge bg-danger badge-pill">Atrasado</span> :
                                                     <span className="badge bg-success badge-pill">Pontual</span>
                                                    }
                                                </td>
                                                <td className="text-center">
                                                    <button className="btn btn-outline-primary btn-sm rounded-circle me-1 p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({placa: l.v, idLinha: l.id, tipo: 'inicial'})}>
                                                        <i className="bi bi-clock" style={{fontSize: 10}}></i>
                                                    </button>
                                                    <button className="btn btn-primary btn-sm rounded-circle shadow-sm p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({placa: l.v, idLinha: l.id, tipo: 'final'})}>
                                                        <i className="bi bi-geo-alt-fill" style={{fontSize: 10}}></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal do Mapa */}
            {selectedMap && (
                <MapModal 
                    placa={selectedMap.placa} 
                    idLinha={selectedMap.idLinha} 
                    tipo={selectedMap.tipo} 
                    onClose={() => setSelectedMap(null)} 
                />
            )}
        </div>
    );
};

// Função auxiliar simples para calcular atraso visualmente no Frontend
function isLineAtrasada(l: Linha, horaServidor: string): boolean {
    const tolerancia = 10; // minutos
    const timeToMin = (t: string) => {
        if(!t || t === 'N/D') return -1;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    const progMin = timeToMin(l.pi);
    const realMin = timeToMin(l.ri);
    const agoraMin = timeToMin(horaServidor);

    if (progMin === -1) return false;

    // Se ainda não saiu (Real = N/D)
    if (realMin === -1) {
        if (agoraMin !== -1 && (agoraMin - progMin > tolerancia)) return true;
        return false;
    }

    // Se já saiu
    if (realMin - progMin > tolerancia) return true;
    
    return false;
}

export default Dashboard;
