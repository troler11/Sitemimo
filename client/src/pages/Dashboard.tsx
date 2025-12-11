import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/api';
import MapModal from '../components/MapModal';
import { useAuth } from '../hooks/useAuth'; 

// 1. IMPORTANTE: Importar o CSS específico aqui
import './Dashboard.css';

interface Linha {
    id: string;
    e: string; 
    r: string; 
    v: string; 
    s: number; // <--- VOLTOU A SER NÚMERO (1 = Ida, 0 = Volta)
    pi: string; 
    ri: string; 
    pf: string; 
    pfn?: string; 
    u: string;  
    c: string;  
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
    // Pegamos isLoggedIn aqui no topo. Vamos usar essa variável.
    const { isLoggedIn, isInitializing, logout } = useAuth();
    const navigate = useNavigate();
    
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

    const linhasRef = useRef(linhas);
    
    // Ref para rastrear se o componente está montado/logado dentro do loop
    const isMountedRef = useRef(true);

    useEffect(() => {
        linhasRef.current = linhas; 
    }, [linhas]);

    // Atualiza o ref de montagem
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // 0. SEGURANÇA
    useEffect(() => {
        if (!isInitializing && !isLoggedIn) {
            navigate('/login');
        }
    }, [isInitializing, isLoggedIn, navigate]);

    // 1. CARREGAMENTO PRINCIPAL
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

    // 2. PREVISÕES TOMTOM (CORRIGIDO)
    const carregarPrevisoesAutomaticamente = useCallback(async () => {
        // Usa a variável do escopo, NÃO chama o hook de novo
        if (!isLoggedIn) return;

        const linhasAtivas = linhasRef.current.filter(l => 
            l.ri && l.ri !== 'N/D' && 
            l.c !== 'Carro desligado' && 
            l.c !== 'Encerrado' && l.v
        );

        if (linhasAtivas.length === 0) return;

        const BATCH_SIZE = 5;
        for (let i = 0; i < linhasAtivas.length; i += BATCH_SIZE) {
            // CORREÇÃO AQUI: Verificamos o Ref ou a variável local, NUNCA useAuth()
            if (!isMountedRef.current) break; 

            const batch = linhasAtivas.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (linha) => {
                try {
                    const cacheBuster = Date.now();
                    const url = `/rota/final/${encodeURIComponent(linha.v)}`;
                    
                    const res = await api.get(url, { 
                        params: { idLinha: linha.id, cache: cacheBuster } 
                    });

                    const novaPrevisao: string = res.data.previsao_chegada;
                    
                    if (novaPrevisao && novaPrevisao !== 'N/D') {
                        setLinhas(prevLinhas => prevLinhas.map(item => 
                            item.id === linha.id ? { ...item, pfn: novaPrevisao } : item
                        ));
                    }
                } catch (err: any) {
                    // Silencioso ou tratamento de erro
                }
            });
            await Promise.allSettled(promises);
        }
    }, [isLoggedIn]); // Dependência simples

    // 3. LOOPS
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

    // --- RENDERIZAÇÃO ---
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
        <div className="container-fluid p-4 dashboard-content-solid">
            {/* Cabeçalho e Busca */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-dark mb-0">Visão Geral da Frota ({horaServidor})</h4>
                <div style={{ width: '300px' }}>
                    <input type="text" className="form-control input-red-border" placeholder="Busca por veículo ou rota..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
            </div>

            {/* Filtros com Borda Vermelha */}
            <div className="row g-3 mb-4">
                <div className="col-md-3">
                    <select className="form-select input-red-border" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                        <option value="">Todas as Empresas</option>
                        {empresasUnicas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select input-red-border" value={filtroSentido} onChange={e => setFiltroSentido(e.target.value)}>
                        <option value="">Sentido: Todos</option>
                        <option value="ida">Entrada</option>
                        <option value="volta">Saida</option>
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select input-red-border" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="atrasado">Atrasados</option>
                        <option value="pontual">Pontual</option>
                    </select>
                </div>
            </div>

            {/* Cards de KPI Coloridos Sólidos (Estilo Imagem 1) */}
            <div className="row g-3 mb-4">
                <div className="col-md-2">
                    <div className="card-kpi-solid card-blue">
                        <h5>TOTAL</h5>
                        <h3>{kpis.total}</h3>
                    </div>
                </div>
                <div className="col-md-2">
                    <div className="card-kpi-solid card-red">
                        <h5>ATRASADOS</h5>
                        <h3>{kpis.atrasados}</h3>
                    </div>
                </div>
                <div className="col-md-2">
                    <div className="card-kpi-solid card-green">
                        <h5>PONTUAL</h5>
                        <h3>{kpis.pontual}</h3>
                    </div>
                </div>
                <div className="col-md-2">
                    <div className="card-kpi-solid card-dark">
                        <h5>DESLIGADOS</h5>
                        <h3>{kpis.desligados}</h3>
                    </div>
                </div>
                <div className="col-md-2">
                    <div className="card-kpi-solid card-cyan">
                        <h5>EM DESLOCAMENTO</h5>
                        <h3>{kpis.deslocamento}</h3>
                    </div>
                </div>
                <div className="col-md-2">
                    <div className="card-kpi-solid card-orange">
                        <h5>NÃO INICIOU</h5>
                        <h3>{kpis.semInicio}</h3>
                    </div>
                </div>
            </div>

            {/* Tabela de Dados */}
            <div className="table-responsive bg-white p-0 shadow-sm">
                <table className="table table-hover align-middle mb-0 table-solid">
                    <thead className="table-light">
                        <tr>
                            <th>Empresa</th>
                            <th>Rota</th>
                            <th>Sentido</th>
                            <th>Veículo</th>
                            <th>Prev. Ini</th>
                            <th>Real Início</th>
                            <th>Prog. Fim</th>
                            <th>Prev. Fim (Real)</th>
                            <th>Ult. Reporte</th>
                            <th>Status</th>
                            <th className="text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={11} className="text-center py-3">Carregando dados da frota...</td></tr>
                        ) : dadosFiltrados.map((l, idx) => {
                            const previsao = getPrevisaoInteligente(l);
                            const valSentido = Number(l.s);
                            const jaSaiu = l.ri && l.ri !== 'N/D';

                            let statusBadge;
                            if (l.c === 'Carro desligado') statusBadge = <span className="badge bg-secondary">Desligado</span>;
                            else if (!jaSaiu) statusBadge = l.pi < horaServidor ? <span className="badge bg-danger">Atrasado (Ini)</span> : <span className="badge bg-light text-dark border">Aguardando</span>;
                            else statusBadge = isLineAtrasada(l) ? <span className="badge bg-danger">Atrasado</span> : <span className="badge bg-success">Pontual</span>;

                            return (
                                <tr key={`${l.id}-${idx}`}>
                                    <td>{l.e}</td>
                                    <td className="text-truncate" style={{maxWidth: '250px'}} title={l.r}>{l.r}</td>
                                    <td>{valSentido === 1 ? 'Entrada' : 'Saida'}</td>
                                    <td className="fw-bold text-primary">{l.v}</td>
                                    <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger' : ''}>{l.pi}</td>
                                    <td>{l.ri}</td>
                                    <td>{l.pf}</td>
                                    <td className={previsao.classe}>
                                        {previsao.horario || 'N/D'}
                                        {previsao.origem === 'TomTom' && <i className="fas fa-satellite-dish ms-1 small text-primary" title="TomTom"></i>}
                                    </td>
                                    <td>{l.u}</td>
                                    <td>{statusBadge}</td>
                                    <td className="text-center">
                                        <button className="btn btn-link btn-sm p-0 me-2 text-secondary" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi || '--:--' })}>
                                            <i className="far fa-clock"></i>
                                        </button>
                                        <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => setSelectedMap({ placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf || 'N/D' })}>
                                            <i className="fas fa-map-marker-alt"></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modal do Mapa (mantido fora do fluxo principal) */}
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
