import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../services/api';

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
    // --- ESTADOS GERAIS ---
    const [dados, setDados] = useState<ItemEscala[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroData, setFiltroData] = useState(new Date().toLocaleDateString('pt-BR'));
    
    // --- ESTADOS DE FILTRO ---
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus, setFiltroStatus] = useState(''); 
    const [busca, setBusca] = useState('');

    // --- ESTADOS PARA EDIÇÃO ---
    const [linhaEmEdicao, setLinhaEmEdicao] = useState<number | null>(null);
    const [formEdicao, setFormEdicao] = useState({ frota_enviada: '', motorista: '' });
    const [salvando, setSalvando] = useState(false);
    
    // --- ESTADOS DO AUTOCOMPLETE ---
    const [listaMotoristas, setListaMotoristas] = useState<string[]>([]);
    const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

    const fetchData = useCallback(async (isAutoUpdate = false) => {
        if (!isAutoUpdate && linhaEmEdicao === null) setLoading(true);
        try {
           const res = await api.get('/escala', { params: { data: filtroData } });
           setDados(Array.isArray(res.data) ? res.data : []);
        } catch (err) { 
            console.error("Erro ao carregar escala:", err); 
        } finally { 
            setLoading(false); 
        }
    }, [filtroData, linhaEmEdicao]);

    useEffect(() => {
        fetchData(); 
    }, [fetchData]);

    useEffect(() => {
        const intervalo = setInterval(() => {
            if (linhaEmEdicao === null) fetchData(true); 
        }, 60000);
        return () => clearInterval(intervalo);
    }, [fetchData, linhaEmEdicao]);

    useEffect(() => {
        const fetchMotoristas = async () => {
            try {
                const res = await api.get(`/motoristas?t=${new Date().getTime()}`);
                setListaMotoristas(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                console.error("Erro ao carregar lista de motoristas:", err);
            }
        };
        fetchMotoristas();
    }, []);

    // Filtra as sugestões baseado no que o usuário digitou
    const sugestoesFiltradas = useMemo(() => {
        if (!formEdicao.motorista) return listaMotoristas;
        const termo = formEdicao.motorista.toLowerCase();
        return listaMotoristas.filter(mot => mot.toLowerCase().includes(termo));
    }, [listaMotoristas, formEdicao.motorista]);

    // Função que é chamada ao clicar num nome da lista suspensa
    const selecionarMotorista = (nome: string) => {
        setFormEdicao({ ...formEdicao, motorista: nome });
        setMostrarSugestoes(false); // Fecha a lista após escolher
    };

    const empresasUnicas = useMemo(() => Array.from(new Set(dados.map(d => d.empresa))).sort(), [dados]);

    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            const realizou = item.ra_val && String(item.ra_val).trim() !== '' && String(item.ra_val).trim() !== '0';
            const isCobrir = (item.obs || '').toLowerCase().includes('cobrir');

            let statusItem = 'pendente';
            if (item.manutencao) statusItem = 'manutencao';
            else if (item.aguardando) statusItem = 'aguardando';
            else if (realizou) statusItem = 'confirmado';
            
            if (filtroStatus && filtroStatus === 'cobrir' && !isCobrir) return false;
            if (filtroStatus && filtroStatus !== 'cobrir' && filtroStatus !== statusItem) return false;
            
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
            if (row.manutencao) k.manutencao++; else if (realizou) k.confirmados++; else k.pendentes++;
            if (row.aguardando) k.aguardando++;
            if ((row.obs || '').toLowerCase().includes('cobrir')) k.cobrir++;
        });
        return k;
    }, [dados, filtroEmpresa]);

    const iniciarEdicao = (index: number, row: ItemEscala) => {
        setLinhaEmEdicao(index);
        setFormEdicao({
            frota_enviada: row.frota_enviada !== '---' ? row.frota_enviada : '',
            motorista: row.motorista
        });
        setMostrarSugestoes(false); // Garante que a lista comece fechada
    };

    const cancelarEdicao = () => {
        setLinhaEmEdicao(null);
        setMostrarSugestoes(false);
    };

    const salvarEdicao = async (row: ItemEscala) => {
        setSalvando(true);
        try {
            await api.put('/escala/atualizar', {
                data_escala: filtroData, empresa: row.empresa, rota: row.rota,
                h_prog: row.h_prog, novo_motorista: formEdicao.motorista, nova_frota: formEdicao.frota_enviada
            });
            setLinhaEmEdicao(null);
            fetchData(false); 
        } catch (err) {
            alert("Ocorreu um erro ao salvar as alterações.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="main-content">
            {/* ... HEADER, KPIS E FILTROS IGUAIS AO SEU CÓDIGO ANTERIOR ... */}
             <div className="header-flex mb-4">
                <div>
                    <h2 className="page-title">Escala Diária</h2>
                    <p className="text-muted small mb-0 mt-1">
                        <i className="fas fa-sync-alt me-1"></i> Atualização automática (1m)
                    </p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    <input type="text" className="form-control red-border text-center fw-bold" value={filtroData} onChange={e => setFiltroData(e.target.value)} placeholder="dd/mm/aaaa" style={{width: '140px'}} />
                    <button className="btn-action-outline" onClick={() => fetchData(false)} title="Atualizar Agora"><i className="fas fa-arrow-right"></i></button>
                </div>
            </div>

            <div className="kpi-row mb-4">
                <div className="kpi-card"><div className="kpi-info"><span className="kpi-label">TOTAL</span><span className="kpi-number text-dark">{kpis.total}</span></div></div>
                <div className="kpi-card"><div className="kpi-info"><span className="kpi-label">CONFIRMADAS</span><span className="kpi-number text-green">{kpis.confirmados}</span></div></div>
                <div className="kpi-card"><div className="kpi-info"><span className="kpi-label">PENDENTES</span><span className="kpi-number text-warning">{kpis.pendentes}</span></div></div>
            </div>

            <div className="filters-flex mb-4">
                <div style={{width: '25%'}}><select className="form-select red-border" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}><option value="">Todas as Empresas</option>{empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
                <div style={{width: '25%'}}><select className="form-select red-border" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}><option value="">Status Visual: Todos</option><option value="pendente">Aguardando RA</option></select></div>
                <div style={{flex: 1}}><input type="text" className="form-control red-border" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
            </div>

            {/* --- TABELA --- */}
            <div className="table-responsive table-card" style={{ overflow: 'visible' }}>
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{width: '25%'}}>Empresa / Rota</th>
                            <th className="text-center" style={{width: '15%'}}>Frota</th>
                            <th style={{width: '20%'}}>Motorista</th>
                            <th style={{width: '15%'}}>Detalhes</th>
                            <th className="text-center" style={{width: '10%'}}>Status</th>
                            <th className="text-end" style={{width: '10%'}}>Horário</th>
                            <th className="text-center" style={{width: '5%'}}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="text-center py-5">Carregando escala...</td></tr>
                        ) : dadosFiltrados.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-5 text-muted">Nenhum registro encontrado.</td></tr>
                        ) : (
                            dadosFiltrados.map((row, i) => {
                                const divergencia = row.frota_escala != row.frota_enviada && row.frota_enviada !== '---';
                                const realizou = row.ra_val && String(row.ra_val).trim() !== '' && String(row.ra_val).trim() !== '0';
                                const isCobrir = (row.obs || '').toLowerCase().includes('cobrir');
                                const emEdicao = linhaEmEdicao === i; 
                                
                                return (
                                    <tr key={i} className={emEdicao ? 'table-warning' : ''}>
                                        <td>
                                            <div className="fw-bold text-dark">{row.empresa}</div>
                                            <div className="text-muted small text-truncate" style={{maxWidth: '250px'}} title={row.rota}>{row.rota}</div>
                                        </td>
                                        
                                        <td className="text-center">
                                            {emEdicao ? (
                                                <input type="text" className="form-control form-control-sm text-center border-warning" value={formEdicao.frota_enviada} onChange={e => setFormEdicao({...formEdicao, frota_enviada: e.target.value})} placeholder="Nova Frota" />
                                            ) : (
                                                <div className="d-flex flex-column align-items-center">
                                                    <span className="badge badge-gray mb-1">{row.frota_escala}</span>
                                                    {divergencia ? <span className="badge badge-red">{row.frota_enviada}</span> : <span className="text-muted small" style={{fontSize: '0.7rem'}}>{row.frota_enviada}</span>}
                                                </div>
                                            )}
                                        </td>
                                        
                                        {/* 🔥 COLUNA: MOTORISTA COM AUTOCOMPLETE CUSTOMIZADO 🔥 */}
                                        <td style={{ position: 'relative' }}>
                                            {emEdicao ? (
                                                <>
                                                    <input 
                                                        type="text" 
                                                        className="form-control form-control-sm border-warning" 
                                                        value={formEdicao.motorista} 
                                                        onChange={e => {
                                                            setFormEdicao({...formEdicao, motorista: e.target.value});
                                                            setMostrarSugestoes(true); // Abre a lista ao digitar
                                                        }}
                                                        onFocus={() => setMostrarSugestoes(true)} // Abre ao clicar
                                                        onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)} // Fecha ao sair (timeout para dar tempo do click na opção)
                                                        placeholder="Pesquise o Motorista..."
                                                        autoComplete="off"
                                                    />
                                                    
                                                    {/* MENU SUSPENSO */}
                                                    {mostrarSugestoes && sugestoesFiltradas.length > 0 && (
                                                        <ul className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto', top: '100%', left: 0 }}>
                                                            {sugestoesFiltradas.map((mot, idx) => (
                                                                <li 
                                                                    key={idx} 
                                                                    className="list-group-item list-group-item-action py-1 px-2 small cursor-pointer"
                                                                    style={{ cursor: 'pointer' }}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault(); // Previne o blur do input
                                                                        selecionarMotorista(mot);
                                                                    }}
                                                                >
                                                                    {mot}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div className="fw-bold text-dark small">{row.motorista}</div>
                                                    {row.reserva && <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Reserva: {row.reserva}</small>}
                                                </>
                                            )}
                                        </td>

                                        <td>
                                            <div className="d-flex flex-column">
                                                {row.obs && <small className="fst-italic" style={{color: isCobrir ? '#6f42c1' : '#6c757d', fontWeight: isCobrir ? 'bold' : 'normal'}}>{row.obs}</small>}
                                                {realizou && <small className="text-green fw-bold mt-1">RA: {row.ra_val}</small>}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            {row.manutencao ? <span className="badge badge-red">Manutenção</span> : realizou ? <span className="badge badge-green">Confirmado</span> : row.aguardando ? <span className="badge badge-warning text-dark">Aguardando</span> : <span className="badge badge-gray">Pendente</span>}
                                        </td>
                                        <td className="text-end">
                                            <div className="small text-muted">Prog: {row.h_prog}</div>
                                            {(row.h_real && row.h_real.length > 2) && <div className={row.h_real > row.h_prog ? 'text-red fw-bold small' : 'text-green fw-bold small'}>Real: {row.h_real}</div>}
                                        </td>

                                        <td className="text-center">
                                            {emEdicao ? (
                                                <div className="d-flex gap-1 justify-content-center">
                                                    <button className="btn btn-sm btn-success" onClick={() => salvarEdicao(row)} disabled={salvando}>{salvando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}</button>
                                                    <button className="btn btn-sm btn-outline-danger" onClick={cancelarEdicao} disabled={salvando}><i className="fas fa-times"></i></button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-sm text-primary" onClick={() => iniciarEdicao(i, row)}><i className="fas fa-pencil-alt"></i></button>
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
