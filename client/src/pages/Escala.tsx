import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../services/api';

// Reutilizamos o CSS do Dashboard para manter a identidade visual
import './Dashboard.css';

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
    manutencao: string;
    aguardando: string;
}

const Escala: React.FC = () => {
    const [dados, setDados] = useState<ItemEscala[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroData, setFiltroData] = useState(new Date().toLocaleDateString('pt-BR'));
    
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus, setFiltroStatus] = useState(''); 
    const [busca, setBusca] = useState('');

    const fetchData = useCallback(async (isAutoUpdate = false) => {
        if (!isAutoUpdate) setLoading(true);
        try {
            const res = await api.get('/escala', { params: { data: filtroData } });
            setDados(res.data);
        } catch (err) { 
            console.error("Erro ao carregar escala:", err); 
        } finally { 
            if (!isAutoUpdate) setLoading(false); 
        }
    }, [filtroData]);

    useEffect(() => {
        fetchData(); 
    }, [fetchData]);

    useEffect(() => {
        const intervalo = setInterval(() => {
            fetchData(true); 
        }, 60000);
        return () => clearInterval(intervalo);
    }, [fetchData]);

    const empresasUnicas = useMemo(() => {
        return Array.from(new Set(dados.map(d => d.empresa))).sort();
    }, [dados]);

    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            
            const realizou = item.ra_val && String(item.ra_val).trim() !== '' && String(item.ra_val).trim() !== '0';
            const obsTexto = (item.obs || '').toLowerCase();
            const isCobrir = obsTexto.includes('cobrir');

            let statusItem = 'pendente';
            if (item.manutencao) statusItem = 'manutencao';
            else if (realizou) statusItem = 'confirmado';
            
            if (filtroStatus) {
                if (filtroStatus === 'cobrir') {
                    if (!isCobrir) return false;
                } else if (filtroStatus !== statusItem) {
                    return false;
                }
            }

            if (busca) {
                const termo = busca.toLowerCase();
                const texto = `${item.empresa} ${item.rota} ${item.motorista} ${item.frota_escala} ${item.obs}`.toLowerCase();
                if (!texto.includes(termo)) return false;
            }

            return true;
        });
    }, [dados, filtroEmpresa, filtroStatus, busca]);

    const kpis = useMemo(() => {
        let k = { total: 0, confirmados: 0, pendentes: 0, manutencao: 0, aguardando: 0, cobrir: 0 };
        
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
        <div className="main-content">
            
            {/* --- HEADER --- */}
            <div className="header-flex mb-4">
                <div>
                    <h2 className="page-title">Escala Diária</h2>
                    <p className="text-muted small mb-0 mt-1">
                        <i className="fas fa-sync-alt me-1"></i> Atualização automática (1m)
                    </p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    <input 
                        type="text" 
                        className="form-control red-border text-center fw-bold" 
                        value={filtroData} 
                        onChange={e => setFiltroData(e.target.value)} 
                        placeholder="dd/mm/aaaa"
                        style={{width: '140px'}}
                    />
                    <button className="btn-action-outline" onClick={() => fetchData(false)} title="Atualizar Agora">
                        <i className="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>

            {/* --- KPI CARDS (LINHA ÚNICA COM SVG) --- */}
            <div className="kpi-row mb-4">
                
                {/* 1. TOTAL */}
                <div className="kpi-card">
                    <div className="kpi-icon text-dark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">TOTAL LINHAS</span>
                        <span className="kpi-number text-dark">{kpis.total}</span>
                    </div>
                </div>

                {/* 2. CONFIRMADAS */}
                <div className="kpi-card">
                    <div className="kpi-icon text-green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">CONFIRMADAS</span>
                        <span className="kpi-number text-green">{kpis.confirmados}</span>
                    </div>
                </div>

                {/* 3. PENDENTES */}
                <div className="kpi-card">
                    <div className="kpi-icon text-warning">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">PENDENTES</span>
                        <span className="kpi-number text-warning">{kpis.pendentes}</span>
                    </div>
                </div>

                {/* 4. MANUTENÇÃO */}
                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">MANUTENÇÃO</span>
                        <span className="kpi-number text-red">{kpis.manutencao}</span>
                    </div>
                </div>

                {/* 5. AGUARDANDO */}
                <div className="kpi-card">
                    <div className="kpi-icon text-warning">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 22h14"></path>
                            <path d="M5 2h14"></path>
                            <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path>
                            <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">AGUARDANDO</span>
                        <span className="kpi-number text-warning">{kpis.aguardando}</span>
                    </div>
                </div>

                {/* 6. COBRIR */}
                <div className="kpi-card">
                    <div className="kpi-icon text-info">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">COBRIR</span>
                        <span className="kpi-number text-info">{kpis.cobrir}</span>
                    </div>
                </div>
            </div>

            {/* --- FILTROS --- */}
            <div className="filters-flex mb-4">
                <div style={{width: '25%'}}>
                    <select className="form-select red-border" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                        <option value="">Todas as Empresas</option>
                        {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
                <div style={{width: '25%'}}>
                    <select className="form-select red-border" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                        <option value="">Status Visual: Todos</option>
                        <option value="pendente">Aguardando RA</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="manutencao">Manutenção</option>
                        <option value="aguardando">Aguardando carro</option>
                        <option value="cobrir">Cobrir</option>
                    </select>
                </div>
                <div style={{flex: 1}}>
                    <input 
                        type="text" 
                        className="form-control red-border" 
                        placeholder="Buscar motorista, frota, rota..." 
                        value={busca} 
                        onChange={e => setBusca(e.target.value)} 
                    />
                </div>
            </div>

            {/* --- TABELA --- */}
            <div className="table-responsive table-card">
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{width: '35%'}}>Empresa / Rota</th>
                            <th className="text-center">Frota</th>
                            <th>Motorista</th>
                            <th>Detalhes</th>
                            <th className="text-center">Status</th>
                            <th className="text-end">Horário</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-5">Carregando escala...</td></tr>
                        ) : dadosFiltrados.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-5 text-muted">Nenhum registro encontrado.</td></tr>
                        ) : (
                            dadosFiltrados.map((row, i) => {
                                const divergencia = row.frota_escala != row.frota_enviada && row.frota_enviada !== '---';
                                const realizou = row.ra_val && String(row.ra_val).trim() !== '' && String(row.ra_val).trim() !== '0';
                                const isCobrir = (row.obs || '').toLowerCase().includes('cobrir');
                                
                                return (
                                    <tr key={i}>
                                        <td>
                                            <div className="fw-bold text-dark">{row.empresa}</div>
                                            <div className="text-muted small text-truncate" style={{maxWidth: '300px'}} title={row.rota}>
                                                {row.rota}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="d-flex flex-column align-items-center">
                                                <span className="badge badge-gray mb-1">{row.frota_escala}</span>
                                                {divergencia ? (
                                                    <span className="badge badge-red">{row.frota_enviada}</span>
                                                ) : (
                                                    <span className="text-muted small" style={{fontSize: '0.7rem'}}>{row.frota_enviada}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="fw-bold text-dark small">{row.motorista}</div>
                                            </div>
                                            {row.reserva && <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Reserva: {row.reserva}</small>}
                                        </td>
                                        <td>
                                            <div className="d-flex flex-column">
                                                {row.obs && (
                                                    <small className="fst-italic" style={{color: isCobrir ? '#6f42c1' : '#6c757d', fontWeight: isCobrir ? 'bold' : 'normal'}}>
                                                        {isCobrir && <i className="fas fa-sync-alt me-1"></i>}
                                                        {row.obs}
                                                    </small>
                                                )}
                                                {realizou && <small className="text-green fw-bold mt-1">RA: {row.ra_val}</small>}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            {row.manutencao ? <span className="badge badge-red">Manutenção</span> :
                                             realizou ? <span className="badge badge-green">Confirmado</span> :
                                             row.aguardando ? <span className="badge badge-warning text-dark">Aguardando</span> :
                                             <span className="badge badge-gray">Pendente</span>}
                                        </td>
                                        <td className="text-end">
                                            <div className="small text-muted">Prog: {row.h_prog}</div>
                                            {(row.h_real && row.h_real.length > 2) && (
                                                <div className={row.h_real > row.h_prog ? 'text-red fw-bold small' : 'text-green fw-bold small'}>
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
    );
};

export default Escala;
