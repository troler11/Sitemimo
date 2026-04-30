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
    hr_sai: string;
    obs: string;
    sentido: string;
    ra_val: string;
    manutencao: string | boolean;
    aguardando: string | boolean;
    cobrir: string | boolean;
    confirmado: string | boolean;
    realocado: string | boolean;
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
    const [formEdicao, setFormEdicao] = useState({ frota_enviada: '', motorista: '', status: '' });
    const [salvando, setSalvando] = useState(false);
    
    // --- ESTADOS DO AUTOCOMPLETE ---
    const [listaMotoristas, setListaMotoristas] = useState<string[]>([]);
    const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

    // --- BUSCA OS DADOS DA ESCALA ---
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
                const res = await api.get(`/motoristas`);
                
                // Força o React a entender que é um Array, mesmo que venha como texto JSON
                let dadosMotoristas = res.data;
                if (typeof dadosMotoristas === 'string') {
                    try { dadosMotoristas = JSON.parse(dadosMotoristas); } catch (e) {}
                }
                
                if (Array.isArray(dadosMotoristas)) {
                    setListaMotoristas(dadosMotoristas);
                }
            } catch (err) {
                console.error("Erro ao carregar lista de motoristas:", err);
            }
        };
        fetchMotoristas();
    }, []);

    // --- FUNÇÕES DO AUTOCOMPLETE ---
    const sugestoesFiltradas = useMemo(() => {
        if (!formEdicao.motorista) return listaMotoristas;
        const termo = formEdicao.motorista.toLowerCase();
        return listaMotoristas.filter(mot => mot.toLowerCase().includes(termo));
    }, [listaMotoristas, formEdicao.motorista]);

    const selecionarMotorista = (nome: string) => {
        setFormEdicao({ ...formEdicao, motorista: nome });
        setMostrarSugestoes(false); 
    };

    // --- PROCESSAMENTO DE DADOS (MEMOIZADOS) ---
    const empresasUnicas = useMemo(() => Array.from(new Set(dados.map(d => d.empresa))).sort(), [dados]);

    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            
            const realizou = item.ra_val && String(item.ra_val).trim() !== '' && String(item.ra_val).trim() !== '0';
            const obsTexto = (item.obs || '').toLowerCase();
            const isCobrir = obsTexto.includes('cobrir');

            let statusItem = 'pendente';
            if (item.manutencao) statusItem = 'manutencao';
            else if (item.aguardando) statusItem = 'aguardando';
            else if (realizou) statusItem = 'CONFIRMADO';
            
            if (filtroStatus) {
                if (filtroStatus === 'cobrir') {
                    if (!isCobrir) return false;
                } else if (filtroStatus !== statusItem) return false;
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

    // --- FUNÇÕES DE EDIÇÃO ---
    // --- FUNÇÕES DE EDIÇÃO ---
    const iniciarEdicao = (index: number, row: ItemEscala) => {
        setLinhaEmEdicao(index);
        
        // 1. Lógica do Status (Tem que ser EXATAMENTE igual aos 'values' do <select>)
        let statusAtual = 'PENDENTE DE CONFIRMAÇÃO'; 
        
        const realizou = row.ra_val && String(row.ra_val).trim() !== '' && String(row.ra_val).trim() !== '0';
        const obsTexto = String(row.obs || '').toUpperCase();

        if (row.manutencao) statusAtual = 'MANUTENÇÃO';
        else if (row.aguardando) statusAtual = 'AGUARDANDO CARRO';
        else if (row.confirmado || realizou) statusAtual = 'CONFIRMADO';
        else if (row.cobrir || obsTexto.includes('COBRIR')) statusAtual = 'COBRIR';
         else if (row.realocado || obsTexto.includes('REALOCADO')) statusAtual = 'REALOCADO';

        setFormEdicao({
            frota_enviada: row.frota_enviada !== '---' ? row.frota_enviada : '',
            // Se houver reserva, ele puxa o reserva para editar. Se não, puxa o titular.
            motorista: row.reserva ? row.reserva : row.motorista, 
            status: statusAtual
        });
        setMostrarSugestoes(false);
    };

    const cancelarEdicao = () => {
        setLinhaEmEdicao(null);
        setMostrarSugestoes(false);
    };

    const salvarEdicao = async (row: ItemEscala) => {
        setSalvando(true);
        try {
            await api.put('/escala/atualizar', {
                data_escala: filtroData, 
                empresa: row.empresa, 
                rota: row.rota,
                h_prog: row.h_prog, 
                novo_motorista: formEdicao.motorista, 
                nova_frota: formEdicao.frota_enviada,
                novo_status: formEdicao.status
            });
            
            // Atualização Otimista
            setDados(prevDados => prevDados.map(item => {
                if (item.empresa === row.empresa && item.rota === row.rota && item.h_prog === row.h_prog) {
                    
                    let novoReserva = item.reserva;
                    const motTitular = String(item.motorista).trim().toUpperCase();
                    const motEnviado = String(formEdicao.motorista).trim().toUpperCase();

                    if (motEnviado !== motTitular && motEnviado !== "") {
                        novoReserva = formEdicao.motorista;
                    } else {
                        novoReserva = "";
                    }
                    
                    return { 
                        ...item, 
                        reserva: novoReserva,
                        frota_enviada: formEdicao.frota_enviada || '---',
                        // 2. Corrigido para bater exatamente com os nomes do select
                        manutencao: formEdicao.status === 'MANUTENÇÃO' ? 'sim' : '', 
                        aguardando: formEdicao.status === 'AGUARDANDO CARRO' ? 'sim' : '',
                        cobrir: formEdicao.status === 'COBRIR' ? 'sim' : '' ,
                        confirmado: formEdicao.status === 'CONFIRMADO' ? 'sim' : '',
                        realocado: formEdicao.status === 'REALOCADO' ? 'sim' : '' ,
                    };
                }
                return item;
            }));
            
            setLinhaEmEdicao(null);
        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Erro ao salvar as alterações.");
        } finally {
            setSalvando(false);
        }
    };

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

            {/* --- KPI CARDS (RESTAURADOS) --- */}
            <div className="kpi-row mb-4">
                
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

                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">COBRIR</span>
                        <span className="kpi-number text-red">{kpis.cobrir}</span>
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
            <div className="table-responsive table-card" style={{ overflow: 'visible' }}>
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{width: '5%'}}>STATUS</th>
                            <th className="text-left" style={{width: '25%'}}>MOTORISTA</th>
                            <th style={{width: '5%'}}>CLIENTE</th>
                            <th style={{width: '20%'}}>LINHA</th>
                            <th className="text-left" style={{width: '10%'}}>SENTIDO</th>
                            <th className="text-left" style={{width: '5%'}}>INICIO</th>
                            <th className="text-left" style={{width: '5%'}}>FIM</th>
                            <th className="text-left" style={{width: '5%'}}>PREFIXO</th>
                            <th className="text-left" style={{width: '10%'}}>OBSERVAÇÔES</th>
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

                                         {/* 🔥 NOVA COLUNA DE STATUS COM DROPDOWN 🔥 */}
                                        <td className="text-center">
                                            {emEdicao ? (
                                                <select 
                                                    className="form-select form-select-sm border-warning text-left"
                                                    value={formEdicao.status}
                                                    onChange={e => setFormEdicao({...formEdicao, status: e.target.value})}
                                                >
                                                    <option value="PENDENTE DE CONFIRMAÇÃO">Pendente</option>
                                                    <option value="AGUARDANDO CARRO">Aguardando Carro</option>
                                                    <option value="MANUTENÇÃO">Manutenção</option>
                                                    <option value="CONFIRMADO">Confirmado</option>
                                                    <option value="COBRIR">Cobrir</option>
                                                    <option value="REALOCADO">Realocado</option>
                                                </select>
                                            ) : (
                                               row.manutencao ? <span className="badge badge-red">Manutenção</span> :
    realizou ? <span className="badge badge-green">CONFIRMADO</span> :
    row.aguardando ? <span className="badge badge-warning text-dark">Aguardando</span> :
    row.realocado ? <span className="badge badge-info text-dark">Realocado</span> : 
    <span className="badge badge-gray">Pendente</span>
                                            )} {realizou && <small className="text-green fw-bold mt-1">RA: {row.ra_val}</small>}
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
                                                            setMostrarSugestoes(true);
                                                        }}
                                                        onFocus={() => setMostrarSugestoes(true)}
                                                        onClick={() => setMostrarSugestoes(true)}
                                                        onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)}
                                                        placeholder="Pesquise o Motorista..."
                                                        autoComplete="off"
                                                    />
                                                    
                                                    {/* MENU SUSPENSO FLUTUANTE */}
                                                    {mostrarSugestoes && sugestoesFiltradas.length > 0 && (
                                                        <ul className="list-group position-absolute w-100 shadow-lg border border-secondary" 
                                                            style={{ zIndex: 9999, maxHeight: '250px', overflowY: 'auto', top: '100%', left: 0, backgroundColor: 'white' }}>
                                                            {sugestoesFiltradas.map((mot, idx) => (
                                                                <li 
                                                                    key={idx} 
                                                                    className="list-group-item list-group-item-action py-2 px-2 small"
                                                                    style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault(); 
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

                                          {/* EMPRESA */}
                                        <td>
                                            <div className="fw-bold text-dark">{row.empresa}</div>
                                            
                                        </td>
                                        
                                        {/* LINHA */}
                                        <td>
                                        <div className="text-muted small text" style={{maxWidth: '250px'}} title={row.rota}>
                                                {row.rota}
                                            </div>
                                        </td>
                                      
                                        {/* SENTIDO */}

                                        <td>
                                        <div className="text-muted small text" style={{maxWidth: '250px'}} title={row.sentido}>
                                                {row.sentido}
                                            </div>
                                        </td>
                                        
                                    {/* INICIO */}
                                         <td className="text-end">
                                            <div className="small text-muted">{row.h_prog}</div>
                                            {(row.h_real && row.h_real.length > 2) && (
                                                <div className={row.h_real > row.h_prog ? 'text-red fw-bold small' : 'text-green fw-bold small'}>
                                                    Real: {row.h_real}
                                                </div>
                                            )}
                                        </td>

                                          {/* FIM */}
                                        <td className="text-end">
                                            <div className="small text-muted">{row.hr_sai}</div>
                                            {(row.h_real && row.h_real.length > 2) && (
                                                <div className={row.hr_sai > row.hr_sai ? 'text-red fw-bold small' : 'text-green fw-bold small'}>
                                                    Real: {row.hr_sai}
                                                </div>
                                            )}
                                        </td>
                                        
                                        {/* FROTA */}
                                        <td className="text-center">
                                            {emEdicao ? (
                                                <input 
                                                    type="text" 
                                                    className="form-control form-control-sm text-center border-warning" 
                                                    value={formEdicao.frota_enviada} 
                                                    onChange={e => setFormEdicao({...formEdicao, frota_enviada: e.target.value})}
                                                    placeholder="Nova Frota"
                                                />
                                            ) : (
                                                <div className="d-flex flex-column align-items-center">
                                                    <span className="badge badge-gray mb-1">{row.frota_escala}</span>
                                                    {divergencia ? (
                                                        <span className="badge badge-red">{row.frota_enviada}</span>
                                                    ) : (
                                                        <span className="text-muted small" style={{fontSize: '0.7rem'}}>{row.frota_enviada}</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        
                                       

                                        <td>
                                            <div className="d-flex flex-column">
                                                {row.obs && (
                                                    <small className="fst-italic" style={{color: isCobrir ? '#6f42c1' : '#6c757d', fontWeight: isCobrir ? 'bold' : 'normal'}}>
                                                        {isCobrir && <i className="fas fa-sync-alt me-1"></i>}
                                                        {row.obs}
                                                    </small>
                                                )}
                                                
                                            </div>
                                        </td>
                                        
                                       
                                        
                                       

                                        <td className="text-center">
                                            {emEdicao ? (
                                                <div className="d-flex gap-1 justify-content-center">
                                                    <button 
                                                        className="btn-circle-salvar" 
                                                        title="Salvar" 
                                                        onClick={() => salvarEdicao(row)}
                                                        disabled={salvando}
                                                    >
                                                        {salvando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                                    </button>
                                                    <button className="btn-circle-cancel" title="Cancelar" onClick={cancelarEdicao} disabled={salvando}>
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                // Correto (React/JSX)
<button 
    type="button" 
    className="btn-circle-edit" 
    title="Editar Motorista/Frota" 
    onClick={() => iniciarEdicao(i, row)}
>
    <i className="fas fa-pencil-alt"></i>
</button>
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
