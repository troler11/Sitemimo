import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';

interface ItemEscala {
    empresa: string;
    rota: string;
    motorista: string;
    reserva: string;
    frota_escala: string;
    frota_enviada: string;
    h_prog: string;
    h_real: string;
    obs: string;
    ra_val: string;
    manutencao: boolean;
    aguardando: boolean;
}

const Escala: React.FC = () => {
    const [dados, setDados] = useState<ItemEscala[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroData, setFiltroData] = useState(new Date().toLocaleDateString('pt-BR'));
    
    // Filtros Locais
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');
    const [busca, setBusca] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/escala', { params: { data: filtroData } });
            setDados(res.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []); // Carrega ao iniciar

    // Lista Única de Empresas
    const empresasUnicas = useMemo(() => {
        return Array.from(new Set(dados.map(d => d.empresa))).sort();
    }, [dados]);

    // Filtragem de Dados
    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            
            const obsTexto = (item.obs || '').toLowerCase();
            const realizou = item.ra_val && String(item.ra_val).trim() !== '';
            const isCobrir = obsTexto.includes('cobrir');

            let statusKey = 'pendente';
            if (item.manutencao) statusKey = 'manutencao';
            else if (realizou) statusKey = 'confirmado';

            if (filtroStatus) {
                if (filtroStatus === 'cobrir') { if (!isCobrir) return false; }
                else if (filtroStatus !== statusKey) return false;
            }

            if (busca) {
                const termo = busca.toLowerCase();
                const textoCompleto = `${item.empresa} ${item.rota} ${item.motorista} ${item.frota_escala} ${item.obs}`.toLowerCase();
                if (!textoCompleto.includes(termo)) return false;
            }

            return true;
        });
    }, [dados, filtroEmpresa, filtroStatus, busca]);

    // KPIs Calculados
    const kpis = useMemo(() => {
        let k = { total: 0, confirmados: 0, pendentes: 0, manutencao: 0, aguardando: 0, cobrir: 0 };
        dadosFiltrados.forEach(row => {
            k.total++;
            const realizou = row.ra_val && String(row.ra_val).trim() !== '';
            const isCobrir = (row.obs || '').toLowerCase().includes('cobrir');

            if (row.manutencao) k.manutencao++;
            else if (realizou) k.confirmados++;
            else k.pendentes++;

            if (row.aguardando) k.aguardando++;
            if (isCobrir) k.cobrir++;
        });
        return k;
    }, [dadosFiltrados]);

    return (
        <div className="container-fluid pt-3">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <div>
                    <h5 className="mb-0 fw-bold text-dark">Visão Geral das Linhas</h5>
                    <div className="d-flex align-items-center small text-muted">
                        <span className="badge bg-success badge-pill me-2">Online</span>
                        Data: <strong>{filtroData}</strong>
                    </div>
                </div>
                
                <div className="d-flex align-items-center gap-3">
                    <div className="d-flex gap-2">
                        <input type="text" className="form-control form-control-sm" value={filtroData} onChange={e => setFiltroData(e.target.value)} style={{width: 120}} placeholder="dd/mm/aaaa" />
                        <button className="btn btn-dark btn-sm" onClick={fetchData}>Ir</button>
                    </div>
                    <div className="position-relative">
                        <i className="bi bi-search search-icon"></i>
                        <input type="text" className="form-control search-bar" placeholder="Buscar na tela..." value={busca} onChange={e => setBusca(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="row g-4 mb-3">
                <div className="col-md-4"><div className="card-summary card-blue"><h5>Total de Linhas</h5><h3>{kpis.total}</h3></div></div>
                <div className="col-md-4"><div className="card-summary card-green"><h5>Confirmadas (RA)</h5><h3>{kpis.confirmados}</h3></div></div>
                <div className="col-md-4"><div className="card-summary bg-gradient-warning"><h5>Pendentes</h5><h3>{kpis.pendentes}</h3></div></div>
            </div>
            
            <div className="row g-3 mb-4">
                <div className="col-md-4"><div className="alert alert-danger d-flex justify-content-between align-items-center mb-0"><strong>Em Manutenção</strong><span className="fs-4 fw-bold">{kpis.manutencao}</span></div></div>
                <div className="col-md-4"><div className="alert alert-warning d-flex justify-content-between align-items-center mb-0"><strong>Aguardando Carro</strong><span className="fs-4 fw-bold">{kpis.aguardando}</span></div></div>
                <div className="col-md-4"><div className="alert alert-info d-flex justify-content-between align-items-center mb-0"><strong>Cobrir</strong><span className="fs-4 fw-bold">{kpis.cobrir}</span></div></div>
            </div>

            {/* Filtros */}
            <div className="filter-bar">
                <div className="row g-3 align-items-end">
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Empresa</label>
                        <select className="form-select form-select-sm" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                            <option value="">Todas</option>
                            {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Status (Visual)</label>
                        <select className="form-select form-select-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="pendente">Aguardando</option>
                            <option value="confirmado">Confirmado</option>
                            <option value="manutencao">Manutenção</option>
                            <option value="cobrir">Cobrir</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div className="card border-0 shadow-sm">
                <div className="card-header bg-white border-bottom py-3">
                    <h6 className="mb-0 fw-bold text-dark">Operação</h6>
                </div>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>Empresa / Rota</th>
                                <th className="text-center">Frotas</th>
                                <th>Motorista</th>
                                <th>Detalhes & Obs</th>
                                <th className="text-center">Status</th>
                                <th className="text-end">Horário</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({length: 5}).map((_,i) => <tr key={i}><td colSpan={6}><div className="skeleton skeleton-text"></div></td></tr>)
                            ) : dadosFiltrados.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-5 text-muted">Nenhum registro encontrado.</td></tr>
                            ) : (
                                dadosFiltrados.map((row, i) => {
                                    const obsTexto = row.obs || '';
                                    const realizou = row.ra_val && String(row.ra_val).trim() !== '';
                                    const isCobrir = obsTexto.toLowerCase().includes('cobrir');
                                    const divergencia = row.frota_escala != row.frota_enviada;

                                    return (
                                        <tr key={i}>
                                            <td>
                                                <div className="fw-bold text-dark">{row.empresa}</div>
                                                <div className="small text-muted text-truncate" style={{maxWidth: 250}}>{row.rota}</div>
                                            </td>
                                            <td className="text-center">
                                                <div className="small text-muted">
                                                    {row.frota_escala} / <strong className={divergencia ? 'text-danger fw-bold text-decoration-underline' : ''}>{row.frota_enviada}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="d-flex flex-column gap-1">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <div className="bg-light rounded-circle p-2 text-secondary"><i className="bi bi-person-fill"></i></div>
                                                        <span className="fw-medium small text-dark">{row.motorista}</span>
                                                    </div>
                                                    {row.reserva && <div className="ms-4 small text-muted"><i className="bi bi-arrow-return-right"></i> Res: <strong>{row.reserva}</strong></div>}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="d-flex flex-column gap-1">
                                                    {row.manutencao && <span className="badge bg-danger bg-opacity-10 text-danger border border-danger py-1" style={{fontSize:'0.7rem'}}>Em Manutenção</span>}
                                                    {row.aguardando && <span className="badge bg-warning bg-opacity-10 text-warning border border-warning py-1" style={{fontSize:'0.7rem'}}>Aguard. Carro</span>}
                                                    {obsTexto && <small className="text-secondary fst-italic" title={obsTexto}>
                                                        {isCobrir && <strong style={{color:'#7e22ce'}}>COBRIR</strong>} {obsTexto.length > 30 ? obsTexto.substring(0,30)+'...' : obsTexto}
                                                    </small>}
                                                    {realizou && <small className="text-success fw-bold" style={{fontSize:'0.75rem'}}>RA: {row.ra_val}</small>}
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                {row.manutencao ? <span className="badge rounded-pill bg-danger px-3">Manutenção</span> :
                                                 realizou ? <span className="badge rounded-pill bg-success px-3">Confirmado</span> :
                                                 <span className="badge rounded-pill bg-warning text-dark px-3">Aguardando</span>}
                                            </td>
                                            <td className="text-end">
                                                <div><small className="text-muted">Prog:</small> <strong>{row.h_prog}</strong></div>
                                                {(row.h_real && row.h_real !== 'N/D') && <div><small className="text-muted">Real:</small> <span className={row.h_real > row.h_prog ? 'text-danger fw-bold' : 'text-muted'}>{row.h_real}</span></div>}
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
    );
};

export default Escala;
