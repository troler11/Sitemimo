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
    pfn?: string; // Previsão Fim Nova
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

    const [selectedMap, setSelectedMap] = useState<{placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string} | null>(null);
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
        const interval = setInterval(fetchData, 30000); 
        return () => clearInterval(interval);
    }, []);

    // --- LÓGICA DE DADOS ---
    
    const empresasUnicas = useMemo(() => {
        const lista = new Set(linhas.map(l => l.e).filter(Boolean));
        return Array.from(lista).sort();
    }, [linhas]);

    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            if (busca) {
                const termo = busca.toLowerCase();
                const textoLinha = `${l.e} ${l.r} ${l.v}`.toLowerCase();
                if (!textoLinha.includes(termo)) return false;
            }
            if (filtroEmpresa && l.e !== filtroEmpresa) return false;
            if (filtroSentido) {
                const sentidoStr = l.s ? 'ida' : 'volta';
                if (filtroSentido !== sentidoStr) return false;
            }
            if (filtroStatus) {
                const atrasado = isLineAtrasada(l);
                if (filtroStatus === 'atrasado' && !atrasado) return false;
                if (filtroStatus === 'pontual' && atrasado) return false;
            }
            return true;
        });
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus]);

    // --- CORREÇÃO: LÓGICA DE KPIS IDÊNTICA AO PHP ---
    const kpis = useMemo(() => {
        let counts = { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
        
        linhas.forEach(l => {
            counts.total++;

            // 1. Categoria: Carro Desligado
            if (l.c === 'Carro desligado') { 
                counts.desligados++; 
                return; 
            }
            
            const jaSaiu = l.ri && l.ri !== 'N/D';
            
            // 2. Se JÁ SAIU (Verifica Atraso vs Pontual)
            if (jaSaiu) {
                if (isLineAtrasada(l)) {
                    counts.atrasados++;
                } else {
                    counts.pontual++;
                }
            } 
            // 3. Se NÃO SAIU (Verifica Sem Início vs Deslocamento)
            else {
                // Compara Strings "HH:mm" (Funciona bem no formato 24h)
                // Se Programado < Agora = Atrasado na Saída (Sem Início)
                if (l.pi < horaServidor) {
                    counts.semInicio++;
                } else {
                    // Se Programado >= Agora = Está indo para o ponto (Deslocamento)
                    counts.deslocamento++;
                }
            }
        });
        return counts;
    }, [linhas, horaServidor]);

    const getCorPrevisao = (prev?: string, prog?: string) => {
        if (!prev || prev === 'N/D' || prev === '--:--' || !prog || prog === 'N/D') return '';
        if (prev > prog) return 'text-danger fw-bold'; 
        return 'text-success fw-bold';
    };

    return (
        <div className="container-fluid pt-3">
            {/* Header */}
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
                        <input type="text" className="form-control search-bar" placeholder="Busca Inteligente..." value={busca} onChange={e => setBusca(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="filter-bar">
                <div className="row g-2 align-items-center">
                    <div className="col-md-3">
                        <label className="form-label small fw-bold text-secondary mb-1">Empresa:</label>
                        <select className="form-select form-select-sm" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                            <option value="">Todas as Empresas</option>
                            {empresasUnicas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
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

            {/* KPIs */}
            <div className="row g-3 mb-4">
                <div className="col-md-2"><div className="card-summary card-blue"><h5>Total</h5><h3>{kpis.total}</h3></div></div>
                <div className="col-md-2"><div className="card-summary card-red"><h5>Atrasados</h5><h3>{kpis.atrasados}</h3></div></div>
                <div className="col-md-2"><div className="card-summary card-green"><h5>Pontual</h5><h3>{kpis.pontual}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-secondary"><h5>Desligados</h5><h3>{kpis.desligados}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-info"><h5>Em Deslocamento</h5><h3>{kpis.deslocamento}</h3></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-warning"><h5>Não Iniciou</h5><h3>{kpis.semInicio}</h3></div></div>
            </div>

            {/* Tabela */}
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
                                    <th title="Previsão de Chegada">Prev. Fim</th>
                                    <th>Ult. Reporte</th>
                                    <th>Status</th>
                                    <th className="text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={11}><div className="skeleton skeleton-text"></div></td></tr>)
                                ) : dadosFiltrados.length === 0 ? (
                                    <tr><td colSpan={11} className="text-center py-4 text-muted">Nenhum veículo encontrado.</td></tr>
                                ) : (
                                    dadosFiltrados.map((l, idx) => {
                                        const atrasado = isLineAtrasada(l);
                                        const iconSentido = l.s ? <i className="bi bi-arrow-right-circle-fill text-primary ms-1"></i> : <i className="bi bi-arrow-left-circle-fill text-warning ms-1"></i>;
                                        const classPrevFim = getCorPrevisao(l.pfn, l.pf);
                                        const jaSaiu = l.ri && l.ri !== 'N/D';
                                        
                                        // Lógica visual do Status na Tabela
                                        let statusBadge;
                                        if (l.c === 'Carro desligado') statusBadge = <span className="badge bg-secondary badge-pill">Desligado</span>;
                                        else if (!jaSaiu) {
                                            // Se não saiu, verifica se está atrasado (passou do horário) ou aguardando
                                            if (l.pi < horaServidor) statusBadge = <span className="badge bg-danger badge-pill blink-animation">Atrasado (Inicial)</span>;
                                            else statusBadge = <span className="badge bg-light text-dark border badge-pill">Aguardando</span>;
                                        }
                                        else if (atrasado) statusBadge = <span className="badge bg-danger badge-pill">Atrasado</span>;
                                        else statusBadge = <span className="badge bg-success badge-pill">Pontual</span>;

                                        return (
                                            <tr key={`${l.id}-${idx}`}>
                                                <td>{l.e}</td>
                                                <td>{l.r} {iconSentido}</td>
                                                <td className="fw-bold text-primary">{l.v}</td>
                                                <td className="text-muted small">--:--</td>
                                                <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger fw-bold' : ''}>{l.pi}</td>
                                                <td>{l.ri}</td>
                                                <td><strong>{l.pf}</strong></td>
                                                <td className={classPrevFim}>{l.pfn || 'N/D'}</td>
                                                <td className="small">{l.u}</td>
                                                <td>{statusBadge}</td>
                                                <td className="text-center">
                                                    <button className="btn btn-outline-primary btn-sm rounded-circle me-1 p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({placa: l.v, idLinha: l.id, tipo: 'inicial'})}>
                                                        <i className="bi bi-clock" style={{fontSize: 10}}></i>
                                                    </button>
                                                    <button className="btn btn-primary btn-sm rounded-circle shadow-sm p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf})}>
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
            {selectedMap && <MapModal placa={selectedMap.placa} idLinha={selectedMap.idLinha} tipo={selectedMap.tipo} onClose={() => setSelectedMap(null)} />}
        </div>
    );
};

// Função auxiliar baseada em tolerância de 10 min
// Recebe a linha, converte horários para minutos e compara
function isLineAtrasada(l: Linha): boolean {
    const tolerancia = 10;
    
    // Se não tem horário programado ou real, não dá pra calcular atraso de viagem
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;

    const [hP, mP] = l.pi.split(':').map(Number);
    const [hR, mR] = l.ri.split(':').map(Number);
    
    const progMin = hP * 60 + mP;
    const realMin = hR * 60 + mR;

    // Diferença simples: Real - Programado
    // Se Real (10:15) - Prog (10:00) = 15 min (> 10) -> Atrasado
    return (realMin - progMin) > tolerancia;
}

export default Dashboard;
