import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/api';
import MapModal from '../components/MapModal';
import { useAuth } from '../hooks/useAuth'; 

// Importante: Importar o CSS atualizado
import './Dashboard.css';

interface Linha {
    id: string;
    e: string; 
    r: string; 
    v: string; 
    s: number; 
    pi: string; 
    ri: string; 
    pf: string; 
    pfn?: string; 
    u: string;  
    c: string;  
}

// Configuração da ordenação
type SortDirection = 'asc' | 'desc';
interface SortConfig {
    key: string;
    direction: SortDirection;
}

function isLineAtrasada(l: Linha): boolean {
    const tolerancia = 10;
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;
    
    // Função auxiliar para limpar "(Pt 2)" e pegar só a hora
    const cleanTimeStr = (t: string) => t ? t.split(' ')[0] : ''; 

    const timeToMinutes = (time: string) => {
        const limpo = cleanTimeStr(time);
        if (!limpo.includes(':')) return 0; // Proteção contra formato inválido
        const [h, m] = limpo.split(':').map(Number);
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

    // Estado para controle de ordenação
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string 
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

    // Função para solicitar a ordenação ao clicar no cabeçalho
    const requestSort = (key: string) => {
        let direction: SortDirection = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Helper para desenhar a setinha de ordenação
    const getSortIcon = (name: string) => {
        if (!sortConfig || sortConfig.key !== name) {
            return null; // ou <span style={{opacity: 0.3}}>⇅</span> se quiser mostrar sempre
        }
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

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

    const dadosFiltrados = useMemo(() => {
        // 1. Filtragem
        let resultado = linhas.filter(l => {
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

        // 2. Ordenação
        if (sortConfig !== null) {
            resultado.sort((a, b) => {
                let valA: any;
                let valB: any;

                // Lógica específica para extrair o valor de comparação dependendo da coluna
                switch (sortConfig.key) {
                    case 'status':
                        // Lógica customizada para status: Desligado < Aguardando < Pontual < Atrasado (exemplo)
                        const getStatusWeight = (l: Linha) => {
                            if (l.c === 'Carro desligado') return 0;
                            const jaSaiu = l.ri && l.ri !== 'N/D';
                            if (!jaSaiu) return l.pi < horaServidor ? 3 : 1; // 3=Atrasado Ini, 1=Aguardando
                            return isLineAtrasada(l) ? 4 : 2; // 4=Atrasado, 2=Pontual
                        };
                        valA = getStatusWeight(a);
                        valB = getStatusWeight(b);
                        break;
                    case 'previsaoReal':
                        // Compara pfn (se existir) ou pf
                        const prevA = getPrevisaoInteligente(a);
                        const prevB = getPrevisaoInteligente(b);
                        valA = prevA.horario || '';
                        valB = prevB.horario || '';
                        break;
                    default:
                        // Padrão: pega a propriedade direta
                        valA = a[sortConfig.key as keyof Linha];
                        valB = b[sortConfig.key as keyof Linha];
                        // Tratamento para nulos/undefined
                        if (valA === undefined || valA === null) valA = '';
                        if (valB === undefined || valB === null) valB = '';
                        // Se for string, lowerCase para garantir ordem correta
                        if (typeof valA === 'string') valA = valA.toLowerCase();
                        if (typeof valB === 'string') valB = valB.toLowerCase();
                        break;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return resultado;
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus, sortConfig, horaServidor]);

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

    if (isInitializing || !isLoggedIn) return null;

    // Estilo inline para o cabeçalho ordenável (preservando classes existentes)
    const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' };

    return (
        <div className="main-content">
            {/* Header com Busca */}
            <div className="header-flex mb-4">
                <h2 className="page-title">Tempo Real</h2>
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

            {/* KPI Cards - LINHA ÚNICA COM SVG (DESENHOS) */}
            <div className="kpi-row mb-4">
                {/* 1. TOTAL (Grade/Grid) */}
                <div className="kpi-card">
                    <div className="kpi-icon text-blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">TOTAL</span>
                        <span className="kpi-number text-blue">{kpis.total}</span>
                    </div>
                </div>

                {/* 2. ATRASADOS (Relógio Vermelho) */}
                <div className="kpi-card">
                    <div className="kpi-icon text-red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">ATRASADOS</span>
                        <span className="kpi-number text-red">{kpis.atrasados}</span>
                    </div>
                </div>

                {/* 3. PONTUAL (Relógio/Check Verde) */}
                <div className="kpi-card">
    <div className="kpi-icon text-green">
        {/* SVG Adaptado */}
        <svg 
            viewBox="0 0 512 512" 
            fill="currentColor" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <polygon points="211.344,306.703 160,256 128,288 211.414,368 384,176 351.703,144 "/>
            <path d="M256,0C114.609,0,0,114.609,0,256s114.609,256,256,256s256-114.609,256-256S397.391,0,256,0z M256,472c-119.297,0-216-96.703-216-216S136.703,40,256,40s216,96.703,216,216S375.297,472,256,472z"/>
        </svg>
    </div>
    <div className="kpi-info">
        <span className="kpi-label">PONTUAL</span>
        <span className="kpi-number text-green">{kpis.pontual}</span>
    </div>
</div>

                {/* 4. DESLIGADOS (Usuário com X) */}
                <div className="kpi-card">
    <div className="kpi-icon text-dark">
        {/* Ícone Power Off limpo para React */}
        <svg 
            viewBox="0 0 24 24" 
            fill="currentColor" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <path 
                fillRule="evenodd" 
                d="M17.7510477,5.00945512 C18.1156885,4.65317657 18.6832031,4.63202809 19.07193,4.94158256 L19.1651661,5.02585826 L19.2621783,5.12532271 C21.0085837,6.96960051 22,9.40828462 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,9.5209679 2.90708036,7.18194928 4.52382631,5.35934352 L4.74867188,5.11404263 L4.83483391,5.02585826 C5.22080233,4.63083063 5.85392472,4.6234867 6.24895234,5.00945512 C6.61359323,5.36573366 6.64790008,5.93260493 6.34744581,6.32840766 L6.26535549,6.42357355 L6.1900436,6.50047785 C4.79197458,7.97689773 4,9.92499537 4,12 C4,16.418278 7.581722,20 12,20 C16.418278,20 20,16.418278 20,12 C20,10.0342061 19.2891973,8.18231218 18.0348658,6.74705738 L17.8208065,6.51175792 L17.7346445,6.42357355 C17.3486761,6.02854592 17.35602,5.39542354 17.7510477,5.00945512 Z M12,2 C12.5522847,2 13,2.44771525 13,3 L13,11 C13,11.5522847 12.5522847,12 12,12 C11.4477153,12 11,11.5522847 11,11 L11,3 C11,2.44771525 11.4477153,2 12,2 Z"
            />
        </svg>
    </div>
    <div className="kpi-info">
        <span className="kpi-label">DESLIGADOS</span>
        <span className="kpi-number text-dark">{kpis.desligados}</span>
    </div>
</div>

                {/* 5. EM TRÂNSITO (Caminhão) */}
                <div className="kpi-card">
                    <div className="kpi-icon text-yellow">
                        <svg 
            viewBox="0 2 20 28" 
            fill="currentColor" 
            width="48" 
            height="48" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M0 22.281v-13.563c0-0.438 0.25-1 0.594-1.344 0.094-0.094 0.219-0.156 0.313-0.219h0.031c1.5-1.156 3.469-2 5.719-2.469 1.188-0.219 2.438-0.344 3.75-0.344s2.563 0.125 3.75 0.344c2.25 0.469 4.219 1.313 5.719 2.469h0.031c0.094 0.063 0.188 0.125 0.281 0.219 0.344 0.344 0.625 0.906 0.625 1.344v13.563c0 1-0.688 1.781-1.594 2v1.813c0 0.844-0.688 1.563-1.531 1.563-0.875 0-1.563-0.719-1.563-1.563v-1.75h-11.438v1.75c0 0.844-0.719 1.563-1.563 1.563-0.875 0-1.563-0.719-1.563-1.563v-1.813c-0.906-0.219-1.563-1-1.563-2zM15.625 6.688h-10.438c-0.563 0-1.031 0.469-1.031 1.031 0 0.531 0.469 1 1.031 1h10.438c0.563 0 1-0.469 1-1 0-0.563-0.438-1.031-1-1.031zM3.125 17.063h14.531c0.563 0 1.031-0.5 1.031-1.063v-5.156c0-0.563-0.469-1.063-1.031-1.063h-14.531c-0.563 0-1 0.5-1 1.063v5.156c0 0.563 0.438 1.063 1 1.063zM4.25 22.281c0.906 0 1.625-0.75 1.625-1.656 0-0.938-0.719-1.656-1.625-1.656-0.938 0-1.656 0.719-1.656 1.656 0 0.906 0.719 1.656 1.656 1.656zM16.531 22.281c0.938 0 1.688-0.75 1.688-1.656 0-0.938-0.75-1.656-1.688-1.656-0.906 0-1.625 0.719-1.625 1.656 0 0.906 0.719 1.656 1.625 1.656z"/>
        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">DESLOCAMENTO</span>
                        <span className="kpi-number text-yellow">{kpis.deslocamento}</span>
                    </div>
                </div>

                {/* 6. NÃO INICIOU (Círculo Vazio) */}
                <div className="kpi-card">
                    <div className="kpi-icon text-grey">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                        </svg>
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">NÃO INICIOU</span>
                        <span className="kpi-number text-grey">{kpis.semInicio}</span>
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div className="table-responsive table-card">
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={thStyle} onClick={() => requestSort('e')}>
                                Empresa {getSortIcon('e')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('r')}>
                                Rota {getSortIcon('r')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('s')}>
                                Sentido {getSortIcon('s')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('v')}>
                                Veículo {getSortIcon('v')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('pi')}>
                                Prev. Ini {getSortIcon('pi')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('ri')}>
                                Real Início {getSortIcon('ri')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('pf')}>
                                Prog. Fim {getSortIcon('pf')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('previsaoReal')}>
                                Prev. Fim (Real) {getSortIcon('previsaoReal')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('u')}>
                                Ult. Reporte {getSortIcon('u')}
                            </th>
                            <th style={thStyle} onClick={() => requestSort('status')}>
                                Status {getSortIcon('status')}
                            </th>
                            <th className="text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={11} className="text-center py-4">Carregando dados da frota...</td></tr>
                        ) : dadosFiltrados.map((l, idx) => {
                            const previsao = getPrevisaoInteligente(l);
                            const valSentido = Number(l.s);
                            const jaSaiu = l.ri && l.ri !== 'N/D';

                            let statusBadge;
                            if (l.c === 'Carro desligado') statusBadge = <span className="badge badge-dark">Desligado</span>;
                            else if (!jaSaiu) statusBadge = l.pi < horaServidor ? <span className="badge badge-red">Atrasado (Ini)</span> : <span className="badge badge-warning">Deslocamento</span>;
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
                                            <button className="btn-action-outline" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi || '--:--' })}>
                                                <i className="far fa-clock"></i>
                                            </button>
                                            <button className="btn-action-outline" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf || 'N/D' })}>
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
                    onClose={() => setSelectedMap(null)} 
                />
            )}
        </div>
    );
};

export default Dashboard;
