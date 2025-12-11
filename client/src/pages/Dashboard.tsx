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
            viewBox="0 0 1200 1200" 
            fill="currentColor" 
            width="24" 
            height="24" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M513.94,0v693.97H686.06V0H513.94z M175.708,175.708C67.129,284.287,0,434.314,0,600c0,331.371,268.629,600,600,600s600-268.629,600-600c0-165.686-67.13-315.713-175.708-424.292l-120.85,120.85C981.102,374.216,1029.126,481.51,1029.126,600c0,236.981-192.146,429.126-429.126,429.126c-236.981,0-429.126-192.145-429.126-429.126c0-118.49,48.025-225.784,125.684-303.442L175.708,175.708z"/>
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
            viewBox="0 0 50 50" 
            fill="currentColor" 
            xmlns="http://www.w3.org/2000/svg"
>
            <path d="M12 0C8.90625 0 6.644531 0.398438 5.09375 1.75C3.542969 3.101563 3 5.230469 3 8L3 12L2 12C0.90625 12 0 12.90625 0 14L0 22C0 23.09375 0.90625 24 2 24L3 24L3 41C3 42.222656 3.382813 43.25 4 44.03125L4 47C4 48.644531 5.355469 50 7 50L11 50C12.644531 50 14 48.644531 14 47L14 46L36 46L36 47C36 48.644531 37.355469 50 39 50L43 50C44.644531 50 46 48.644531 46 47L46 44.03125C46.617188 43.25 47 42.222656 47 41L47 24L48 24C49.09375 24 50 23.09375 50 22L50 14C50 12.90625 49.09375 12 48 12L47 12L47 9C47 6.355469 46.789063 4.191406 45.71875 2.53125C44.648438 0.871094 42.6875 0 40 0 Z M 12 2L40 2C42.3125 2 43.351563 2.542969 44.03125 3.59375C44.710938 4.644531 45 6.484375 45 9L45 41C45 42.386719 44.601563 42.933594 43.78125 43.375C42.960938 43.816406 41.585938 44 40 44L10 44C8.414063 44 7.039063 43.816406 6.21875 43.375C5.398438 42.933594 5 42.386719 5 41L5 8C5 5.484375 5.457031 4.109375 6.40625 3.28125C7.355469 2.453125 9.09375 2 12 2 Z M 15 3C13.90625 3 13 3.90625 13 5L13 7C13 8.09375 13.90625 9 15 9L36 9C37.09375 9 38 8.09375 38 7L38 5C38 3.90625 37.09375 3 36 3 Z M 15 5L36 5L36 7L15 7 Z M 11 10C9.832031 10 8.765625 10.296875 8.03125 11.03125C7.296875 11.765625 7 12.832031 7 14L7 26C7 27.167969 7.296875 28.234375 8.03125 28.96875C8.765625 29.703125 9.832031 30 11 30L39 29.9375C39.816406 29.9375 40.695313 29.625 41.5 29C42.304688 28.375 43 27.324219 43 26L43 14C43 12.832031 42.703125 11.765625 41.96875 11.03125C41.234375 10.296875 40.167969 10 39 10 Z M 11 12L39 12C39.832031 12 40.265625 12.203125 40.53125 12.46875C40.796875 12.734375 41 13.167969 41 14L41 26C41 26.675781 40.714844 27.070313 40.28125 27.40625C39.847656 27.742188 39.230469 27.9375 39 27.9375L11 28C10.167969 28 9.734375 27.796875 9.46875 27.53125C9.203125 27.265625 9 26.832031 9 26L9 14C9 13.167969 9.203125 12.734375 9.46875 12.46875C9.734375 12.203125 10.167969 12 11 12 Z M 2 14L3 14L3 22L2 22 Z M 47 14L48 14L48 22L47 22 Z M 11.5 33C9.027344 33 7 35.027344 7 37.5C7 39.972656 9.027344 42 11.5 42C13.972656 42 16 39.972656 16 37.5C16 35.027344 13.972656 33 11.5 33 Z M 38.5 33C36.027344 33 34 35.027344 34 37.5C34 39.972656 36.027344 42 38.5 42C40.972656 42 43 39.972656 43 37.5C43 35.027344 40.972656 33 38.5 33 Z M 11.5 35C12.890625 35 14 36.109375 14 37.5C14 38.890625 12.890625 40 11.5 40C10.109375 40 9 38.890625 9 37.5C9 36.109375 10.109375 35 11.5 35 Z M 38.5 35C39.890625 35 41 36.109375 41 37.5C41 38.890625 39.890625 40 38.5 40C37.109375 40 36 38.890625 36 37.5C36 36.109375 37.109375 35 38.5 35 Z M 6 45.4375C7.199219 45.890625 8.566406 46 10 46L12 46L12 47C12 47.5625 11.5625 48 11 48L7 48C6.4375 48 6 47.5625 6 47 Z M 44 45.4375L44 47C44 47.5625 43.5625 48 43 48L39 48C38.4375 48 38 47.5625 38 47L38 46L40 46C41.433594 46 42.800781 45.890625 44 45.4375Z" />
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
