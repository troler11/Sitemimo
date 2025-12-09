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
    pf: string; // prog fim (Tabela Fixa)
    pfn?: string; // Previsão Fim Nova (Cálculo TomTom/Mapa vindo do Backend)
    u: string;  // ultima atualizacao
    c: string;  // status
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

    // Estado do Modal
    const [selectedMap, setSelectedMap] = useState<{
        placa: string, 
        idLinha: string, 
        tipo: 'inicial'|'final',
        pf: string 
    } | null>(null);

    const fetchData = async () => {
        try {
            // O backend precisa entregar o 'pfn' (cálculo do mapa) neste endpoint para que a tabela já carregue atualizada
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
                if (!`${l.e} ${l.r} ${l.v}`.toLowerCase().includes(termo)) return false;
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
                if (isLineAtrasada(l)) counts.atrasados++;
                else counts.pontual++;
            } else {
                if (l.pi < horaServidor) counts.semInicio++;
                else counts.deslocamento++;
            }
        });
        return counts;
    }, [linhas, horaServidor]);

    // --- LÓGICA CENTRAL: CALCULA QUAL HORÁRIO MOSTRAR ---
    const getPrevisaoInteligente = (linha: Linha) => {
        // Verifica se existe cálculo do mapa (TomTom) válido vindo do backend
        const temTomTom = linha.pfn && linha.pfn !== 'N/D' && linha.pfn !== '--:--' && linha.pfn !== '';
        
        // Se tiver TomTom, usa ele. Se não, usa o Programado.
        const horarioExibicao = temTomTom ? linha.pfn : linha.pf;
        
        // Define a cor baseada na comparação
        let classeCor = 'text-dark'; // Padrão
        
        if (temTomTom && linha.pf) {
            // Se a previsão do mapa for maior que o programado -> Atraso (Vermelho)
            if (linha.pfn! > linha.pf) {
                classeCor = 'text-danger fw-bold'; 
            } else {
                classeCor = 'text-success fw-bold';
            }
        } else if (!temTomTom) {
            classeCor = 'text-muted'; // Cor de "apenas programado"
        }

        return { 
            horario: horarioExibicao, 
            classe: classeCor,
            origem: temTomTom ? 'TomTom' : 'Tabela'
        };
    };

    return (
        <div className="container-fluid pt-3">
            {/* Header e Filtros (Resumido para focar na lógica) */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-dark mb-1">Visão Geral da Frota</h4>
                <div className="position-relative w-25">
                    <input type="text" className="form-control" placeholder="Busca..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
            </div>

            {/* Filtros Dropdown */}
            <div className="row g-2 mb-3">
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
                        <option value="">Todas as Empresas</option>
                        {empresasUnicas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroSentido} onChange={e => setFiltroSentido(e.target.value)}>
                        <option value="">Sentido: Todos</option>
                        <option value="ida">IDA</option>
                        <option value="volta">VOLTA</option>
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select form-select-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="atrasado">Atrasados</option>
                        <option value="pontual">Pontual</option>
                    </select>
                </div>
            </div>

            {/* KPIs */}
            <div className="row g-3 mb-4">
                <div className="col-md-2"><div className="card-summary card-blue"><h5>{kpis.total}</h5><small>Total</small></div></div>
                <div className="col-md-2"><div className="card-summary card-red"><h5>{kpis.atrasados}</h5><small>Atrasados</small></div></div>
                <div className="col-md-2"><div className="card-summary card-green"><h5>{kpis.pontual}</h5><small>Pontual</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-secondary"><h5>{kpis.desligados}</h5><small>Desligados</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-info"><h5>{kpis.deslocamento}</h5><small>Em Rota</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-warning"><h5>{kpis.semInicio}</h5><small>Ñ Iniciou</small></div></div>
            </div>

            {/* Tabela */}
            <div className="card border-0 shadow-sm">
                <div className="table-responsive">
                    <table className="table table-hover table-sm table-ultra-compact align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>Empresa</th>
                                <th>Rota</th>
                                <th>Veículo</th>
                                <th className="col-narrow">Prev. Ini</th>
                                <th>Real Início</th>
                                
                                {/* AQUI: Removemos "Prog. Fim" separado e deixamos apenas uma coluna final inteligente */}
                                <th title="Horário Programado Original">Prog. Fim</th>
                                <th title="Considera trânsito (TomTom)">Prev. Fim (Real)</th>
                                
                                <th>Ult. Reporte</th>
                                <th>Status</th>
                                <th className="text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} className="text-center py-3">Carregando dados da frota...</td></tr>
                            ) : dadosFiltrados.map((l, idx) => {
                                const jaSaiu = l.ri && l.ri !== 'N/D';
                                const atrasado = isLineAtrasada(l);
                                const valSentido = Number(l.s);
                                
                                // --- O PULO DO GATO ---
                                // Calculamos qual horário mostrar com base na existência do TomTom
                                const previsao = getPrevisaoInteligente(l);

                                let statusBadge;
                                if (l.c === 'Carro desligado') statusBadge = <span className="badge bg-secondary badge-pill">Desligado</span>;
                                else if (!jaSaiu) statusBadge = l.pi < horaServidor ? <span className="badge bg-danger badge-pill">Atrasado (Ini)</span> : <span className="badge bg-light text-dark border">Aguardando</span>;
                                else statusBadge = atrasado ? <span className="badge bg-danger badge-pill">Atrasado</span> : <span className="badge bg-success badge-pill">Pontual</span>;

                                return (
                                    <tr key={`${l.id}-${idx}`}>
                                        <td>{l.e}</td>
                                        <td>{l.r} {valSentido === 1 ? '➡️' : '⬅️'}</td>
                                        <td className="fw-bold text-primary">{l.v}</td>
                                        <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger' : ''}>{l.pi}</td>
                                        <td>{l.ri}</td>
                                        
                                        {/* Coluna Programada (Fixo) */}
                                        <td className="text-muted small">{l.pf}</td>

                                        {/* Coluna Prev. Fim (Inteligente) */}
                                        {/* Aqui mostramos o valor do TomTom se existir */}
                                        <td className={previsao.classe}>
                                            {previsao.horario || 'N/D'}
                                            {previsao.origem === 'TomTom' && (
                                                <i className="bi bi-broadcast ms-1 small" title="Cálculo em Tempo Real (TomTom)"></i>
                                            )}
                                        </td>

                                        <td className="small">{l.u}</td>
                                        <td>{statusBadge}</td>
                                        <td className="text-center">
                                            {/* Botão Mapa */}
                                            <button className="btn btn-primary btn-sm rounded-circle shadow-sm" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, 
                                                idLinha: l.id, 
                                                tipo: 'final', 
                                                // IMPORTANTE: Passamos o Programado Original para o Modal comparar
                                                // O Modal vai buscar o Real novamente, mas visualmente eles vão bater
                                                pf: l.pf 
                                            })}>
                                                <i className="bi bi-geo-alt-fill" style={{fontSize: 10}}></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
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

function isLineAtrasada(l: Linha): boolean {
    const tolerancia = 10;
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;
    const [hP, mP] = l.pi.split(':').map(Number);
    const [hR, mR] = l.ri.split(':').map(Number);
    return (hR * 60 + mR) - (hP * 60 + mP) > tolerancia;
}

export default Dashboard;
