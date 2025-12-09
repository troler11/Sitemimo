import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';

// Interface que espelha o retorno do backend
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
    
    // Filtros
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus, setFiltroStatus] = useState(''); // 'confirmado', 'pendente', 'manutencao', 'cobrir'
    const [busca, setBusca] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/escala', { params: { data: filtroData } });
            setDados(res.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // 1. Lista de Empresas para o Select
    const empresasUnicas = useMemo(() => {
        return Array.from(new Set(dados.map(d => d.empresa))).sort();
    }, [dados]);

    // 2. Lógica de Filtragem
    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            // Filtro Empresa
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            
            // Definição de Status
            const realizou = item.ra_val && String(item.ra_val).trim() !== '' && String(item.ra_val).trim() !== '0';
            const obsTexto = (item.obs || '').toLowerCase();
            const isCobrir = obsTexto.includes('cobrir');

            let statusItem = 'pendente';
            if (item.manutencao) statusItem = 'manutencao';
            else if (realizou) statusItem = 'confirmado';
            
            // Filtro Status Dropdown
            if (filtroStatus) {
                if (filtroStatus === 'cobrir') {
                    if (!isCobrir) return false;
                } else if (filtroStatus !== statusItem) {
                    return false;
                }
            }

            // Busca Texto Global
            if (busca) {
                const termo = busca.toLowerCase();
                const texto = `${item.empresa} ${item.rota} ${item.motorista} ${item.frota_escala} ${item.obs}`.toLowerCase();
                if (!texto.includes(termo)) return false;
            }

            return true;
        });
    }, [dados, filtroEmpresa, filtroStatus, busca]);

    // 3. Cálculo de KPIs (Baseado sempre no TOTAL da busca, não apenas no filtro de status)
    const kpis = useMemo(() => {
        let k = { total: 0, confirmados: 0, pendentes: 0, manutencao: 0, aguardando: 0, cobrir: 0 };
        
        // Calculamos sobre 'dados' filtrados apenas por empresa/data, para os KPIs serem úteis
        // Se usarmos 'dadosFiltrados' aqui, ao selecionar 'Confirmado', os outros viram zero.
        // Vamos usar a lista completa 'dados' mas respeitando o filtro de empresa se houver.
        const baseCalculo = filtroEmpresa ? dados.filter(d => d.empresa === filtroEmpresa) : dados;

        baseCalculo.forEach(row => {
            k.total++;
            const realizou = row.ra_val && String(row.ra_val).trim() !== '' && String(row.ra_val).trim() !== '0';
            const obsTexto = (row.obs || '').toLowerCase();
            const isCobrir = obsTexto.includes('cobrir');

            if (row.manutencao) k.manutencao++;
            else if (realizou) k.confirmados++;
            else k.pendentes++;

            if (row.aguardando) k.aguardando++;
            if (isCobrir) k.cobrir++;
        });
        return k;
    }, [dados, filtroEmpresa]);

    return (
        <div className="container-fluid pt-3">
            
            {/* --- HEADER: TÍTULO E CONTROLE DE DATA --- */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h4 className="fw-bold text-dark mb-1">Escala de Frota</h4>
                    <p className="text-muted small mb-0">
                        <span className="badge bg-success border me-2">Online</span>
                        Dados de: <strong>{filtroData}</strong>
                    </p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    <input 
                        type="text" 
                        className="form-control text-center" 
                        value={filtroData} 
                        onChange={e => setFiltroData(e.target.value)} 
                        placeholder="dd/mm/aaaa"
                        style={{width: '120px'}}
                    />
                    <button className="btn btn-dark" onClick={fetchData} title="Atualizar">
                        <i className="bi bi-arrow-clockwise"></i>
                    </button>
                </div>
            </div>

            {/* --- LINHA 1: CARDS DE KPI (GRADIENTES) --- */}
            <div className="row g-3 mb-3">
                <div className="col-md-4">
                    <div className="card-summary card-blue">
                        <h5>Total de Linhas</h5>
                        <h3>{kpis.total}</h3>
                    </div>
                </div>
                <div className="col-md-4">
                    <div className="card-summary card-green">
                        <h5>Confirmadas (RA)</h5>
                        <h3>{kpis.confirmados}</h3>
                    </div>
                </div>
                <div className="col-md-4">
                    <div className="card-summary bg-gradient-warning">
                        <h5>Pendentes</h5>
                        <h3>{kpis.pendentes}</h3>
                    </div>
                </div>
            </div>

            {/* --- LINHA 2: ALERTAS DE STATUS CRÍTICO --- */}
            <div className="row g-3 mb-4">
                <div className="col-md-4">
                    <div className="alert alert-danger d-flex justify-content-between align-items-center mb-0 shadow-sm border-0">
                        <strong><i className="bi bi-wrench-adjustable me-2"></i>Em Manutenção</strong>
                        <span className="fs-4 fw-bold">{kpis.manutencao}</span>
                    </div>
                </div>
                <div className="col-md-4">
                    <div className="alert alert-warning d-flex justify-content-between align-items-center mb-0 shadow-sm border-0 text-dark">
                        <strong><i className="bi bi-cone-striped me-2"></i>Aguardando Carro</strong>
                        <span className="fs-4 fw-bold">{kpis.aguardando}</span>
                    </div>
                </div>
                <div className="col-md-4">
                    <div className="alert alert-info d-flex justify-content-between align-items-center mb-0 shadow-sm border-0">
                        <strong><i className="bi bi-arrow-repeat me-2"></i>Cobrir</strong>
                        <span className="fs-4 fw-bold">{kpis.cobrir}</span>
                    </div>
                </div>
            </div>

            {/* --- BARRA DE FILTROS E BUSCA --- */}
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
                        <label className="form-label small fw-bold text-secondary mb-1">Status Visual</label>
                        <select className="form-select form-select-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="pendente">Aguardando RA</option>
                            <option value="confirmado">Confirmado</option>
                            <option value="manutencao">Manutenção</option>
                            <option value="cobrir">Cobrir</option>
                        </select>
                    </div>
                    <div className="col-md-6">
                        <div className="position-relative">
                            <i className="bi bi-search search-icon"></i>
                            <input 
                                type="text" 
                                className="form-control search-bar" 
                                placeholder="Buscar motorista, frota, rota..." 
                                value={busca} 
                                onChange={e => setBusca(e.target.value)} 
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* --- TABELA DETALHADA --- */}
            <div className="card border-0 shadow-sm">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>Empresa / Rota</th>
                                <th className="text-center">Frota (Esc/Real)</th>
                                <th>Motorista</th>
                                <th>Detalhes & Obs</th>
                                <th className="text-center">Status</th>
                                <th className="text-end">Horário</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({length: 5}).map((_,i) => (
                                    <tr key={i}><td colSpan={6}><div className="skeleton skeleton-text"></div></td></tr>
                                ))
                            ) : dadosFiltrados.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-5 text-muted">Nenhum registro encontrado.</td></tr>
                            ) : (
                                dadosFiltrados.map((row, i) => {
                                    // Helpers Visuais
                                    const divergencia = row.frota_escala != row.frota_enviada && row.frota_enviada !== '---';
                                    const realizou = row.ra_val && String(row.ra_val).trim() !== '' && String(row.ra_val).trim() !== '0';
                                    const isCobrir = (row.obs || '').toLowerCase().includes('cobrir');
                                    
                                    return (
                                        <tr key={i} className={row.manutencao ? 'table-danger' : ''}>
                                            {/* 1. Empresa e Rota */}
                                            <td>
                                                <div className="fw-bold text-dark" style={{fontSize: '0.9rem'}}>{row.empresa}</div>
                                                <div className="text-muted small text-truncate" style={{maxWidth: '280px'}} title={row.rota}>
                                                    {row.rota}
                                                </div>
                                            </td>

                                            {/* 2. Frota (Comparativo) */}
                                            <td className="text-center">
                                                <div className="d-flex flex-column align-items-center">
                                                    <span className="badge bg-light text-dark border mb-1">{row.frota_escala}</span>
                                                    {divergencia ? (
                                                        <span className="badge bg-danger">{row.frota_enviada}</span>
                                                    ) : (
                                                        <span className="text-muted small">{row.frota_enviada}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 3. Motorista */}
                                            <td>
                                                <div className="d-flex align-items-center">
                                                    <div className="bg-light rounded-circle p-2 me-2 text-secondary">
                                                        <i className="bi bi-person-fill"></i>
                                                    </div>
                                                    <div>
                                                        <div className="fw-bold text-dark small">{row.motorista}</div>
                                                        {row.reserva && <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Reserva: {row.reserva}</small>}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 4. Detalhes e Obs */}
                                            <td>
                                                <div className="d-flex flex-column">
                                                    {row.manutencao && <span className="text-danger fw-bold small"><i className="bi bi-exclamation-octagon me-1"></i>EM MANUTENÇÃO</span>}
                                                    {row.aguardando && <span className="text-warning fw-bold small"><i className="bi bi-hourglass-split me-1"></i>AGUARDANDO CARRO</span>}
                                                    
                                                    {/* Obs com destaque para COBRIR */}
                                                    {row.obs && (
                                                        <small className="fst-italic mt-1" style={{color: isCobrir ? '#6f42c1' : '#6c757d', fontWeight: isCobrir ? 'bold' : 'normal'}}>
                                                            {isCobrir && <i className="bi bi-arrow-repeat me-1"></i>}
                                                            {row.obs}
                                                        </small>
                                                    )}
                                                    
                                                    {realizou && <small className="text-success fw-bold mt-1"><i className="bi bi-check-all me-1"></i>RA: {row.ra_val}</small>}
                                                </div>
                                            </td>

                                            {/* 5. Badge de Status */}
                                            <td className="text-center">
                                                {row.manutencao ? <span className="badge rounded-pill bg-danger px-3">Manutenção</span> :
                                                 realizou ? <span className="badge rounded-pill bg-success px-3">Confirmado</span> :
                                                 row.aguardando ? <span className="badge rounded-pill bg-warning text-dark px-3">Aguardando</span> :
                                                 <span className="badge rounded-pill bg-secondary bg-opacity-50 text-dark px-3">Pendente</span>}
                                            </td>

                                            {/* 6. Horários */}
                                            <td className="text-end">
                                                <div className="small">Prog: <strong>{row.h_prog}</strong></div>
                                                {(row.h_real && row.h_real.length > 2) && (
                                                    <div className={row.h_real > row.h_prog ? 'text-danger fw-bold small' : 'text-success fw-bold small'}>
                                                        Real: {row.h_real}
                                                    </div>
                                                )}
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
