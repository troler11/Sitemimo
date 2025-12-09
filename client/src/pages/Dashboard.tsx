import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../services/api';
import MapModal from '../components/MapModal';

interface Linha {
    id: string;
    e: string; // empresa
    r: string; // rota
    v: string; // veiculo
    s: number; // sentido
    pi: string; // prog inicio
    ri: string; // real inicio
    pf: string; // prog fim (Tabela Fixa)
    pfn?: string; // Previsão TomTom
    u: string;  // update
    c: string;  // status
}

// Helper: Checa se a linha saiu atrasada (tolerância de 10 minutos)
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
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const [horaServidor, setHoraServidor] = useState('00:00');
    
    // Estados de Filtro
    const [busca, setBusca] = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroSentido, setFiltroSentido] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    // Estado do Modal
    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string 
    } | null>(null);

    // 1. CARREGAMENTO PRINCIPAL COM PRESERVAÇÃO DE ESTADO
    const fetchData = async () => {
        try {
            const res = await api.get('/dashboard');
            const linhasServidor: Linha[] = res.data.todas_linhas || [];
            
            // Fusão: Preserva o PFN local se o servidor enviar cache vazio
            setLinhas(prevLinhas => {
                if (prevLinhas.length === 0) return linhasServidor;
                
                return linhasServidor.map(serverLinha => {
                    const linhaAnterior = prevLinhas.find(l => l.id === serverLinha.id);
                    // Se o servidor não mandou um PFN, mas nós temos um fresco localmente, usamos o local.
                    if (!serverLinha.pfn && linhaAnterior?.pfn) {
                        return { ...serverLinha, pfn: linhaAnterior.pfn };
                    }
                    return serverLinha;
                });
            });

            if(res.data.hora) setHoraServidor(res.data.hora);
            setLoading(false);
        } catch (error) {
            console.error("Erro dashboard", error);
        }
    };

    // 2. FUNÇÃO DE CÁLCULO DE PREVISÕES INDIVIDUAIS (LOTE DE 5)
    // 2. FUNÇÃO DE CÁLCULO DE PREVISÕES INDIVIDUAIS (LOTE DE 5)
const carregarPrevisoesAutomaticamente = useCallback(async () => {
    const BATCH_SIZE = 5;
    
    const linhasAtivas = linhas.filter(l => 
        l.ri && l.ri !== 'N/D' && 
        l.c !== 'Carro desligado' && 
        l.c !== 'Encerrado'
    );

    if (linhasAtivas.length === 0) {
        console.log("⏱️ PREVISÃO AUTOMÁTICA: Nenhuma linha ativa para calcular.");
        return;
    }
    
    console.log(`⏱️ PREVISÃO AUTOMÁTICA: Iniciando atualização em lotes de ${BATCH_SIZE} para ${linhasAtivas.length} veículos.`);

    for (let i = 0; i < linhasAtivas.length; i += BATCH_SIZE) {
        const batch = linhasAtivas.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`\n➡️ Processando LOTE ${batchNumber} (${batch.length} veículos)...`);

        const promises = batch.map(async (linha) => {
            try {
                const cacheBuster = Date.now();
                
                // LOG: Requisitando (com cache buster)
                console.log(`   [API REQ] ${linha.v} (ID: ${linha.id}) - Buscando TomTom...`);

                const res = await api.get(`/rota/final/${linha.v}`, { 
                    params: { idLinha: linha.id, cache: cacheBuster } 
                });

                const novaPrevisao: string = res.data.previsao_chegada;
                
                // LOG: Resultado da Requisição
                if (novaPrevisao && novaPrevisao !== 'N/D') {
                    console.log(`   ✅ [SUCESSO] ${linha.v}: Antigo PFN=${linha.pfn || 'N/D'} -> Novo PFN=${novaPrevisao}`);
                    
                    // Atualiza o estado
                    setLinhas(prevLinhas => prevLinhas.map(item => 
                        item.id === linha.id ? { ...item, pfn: novaPrevisao } : item
                    ));
                } else {
                    console.log(`   ⚠️ [ATENÇÃO] ${linha.v}: Backend retornou valor vazio ("${novaPrevisao}") ou não retornou TomTom. Mantendo PFN antigo.`);
                }
            } catch (err) {
                console.error(`   ❌ [FALHA DE REDE] Erro ao buscar previsão para ${linha.v}.`, err);
            }
        });

        await Promise.allSettled(promises);
        console.log(`   ☑️ LOTE ${batchNumber} finalizado.`);
    }
    console.log("⏱️ PREVISÃO AUTOMÁTICA: Ciclo de atualização de lotes concluído.");
}, [linhas]);

    // 3. Loops de Refresh
    useEffect(() => {
        fetchData();
        const intervalPrincipal = setInterval(fetchData, 30000); 
        return () => clearInterval(intervalPrincipal);
    }, []);

    useEffect(() => {
        if (!loading && linhas.length > 0) {
            carregarPrevisoesAutomaticamente(); 
            const intervalPrevisao = setInterval(() => {
                carregarPrevisoesAutomaticamente();
            }, 60000);
            
            return () => clearInterval(intervalPrevisao);
        }
    }, [loading, linhas.length, carregarPrevisoesAutomaticamente]);


    // --- LÓGICA DE EXIBIÇÃO E FILTRAGEM (useMemo) ---

    const empresasUnicas = useMemo(() => [...new Set(linhas.map(l => l.e).filter(Boolean))].sort(), [linhas]);

    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            // Filtro Busca
            if (busca) {
                const termo = busca.toLowerCase();
                const textoLinha = `${l.e} ${l.r} ${l.v}`.toLowerCase();
                if (!textoLinha.includes(termo)) return false;
            }
            // Filtro Empresa
            if (filtroEmpresa && l.e !== filtroEmpresa) return false;
            
            // Filtro Sentido
            if (filtroSentido) {
                const sentidoReal = Number(l.s) === 1 ? 'ida' : 'volta';
                if (filtroSentido !== sentidoReal) return false;
            }
            
            // Filtro Status
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

    // Lógica que decide o valor e cor da previsão
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

    return (
        <div className="container-fluid pt-3">
            {/* --- HEADER E BUSCA --- */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-dark mb-1">Visão Geral da Frota ({horaServidor})</h4>
                <div className="position-relative w-25">
                    <input type="text" className="form-control" placeholder="Busca por veículo ou rota..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
            </div>

            {/* --- FILTROS --- */}
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
                        <option value="ida">IDA ➡️</option>
                        <option value="volta">VOLTA ⬅️</option>
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

            {/* --- KPIs (Key Performance Indicators) --- */}
            <div className="row g-3 mb-4">
                <div className="col-md-2"><div className="card-summary card-blue"><h5>{kpis.total}</h5><small>Total</small></div></div>
                <div className="col-md-2"><div className="card-summary card-red"><h5>{kpis.atrasados}</h5><small>Atrasados</small></div></div>
                <div className="col-md-2"><div className="card-summary card-green"><h5>{kpis.pontual}</h5><small>Pontual</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-secondary"><h5>{kpis.desligados}</h5><small>Desligados</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-info"><h5>{kpis.deslocamento}</h5><small>Em Rota</small></div></div>
                <div className="col-md-2"><div className="card-summary bg-gradient-warning"><h5>{kpis.semInicio}</h5><small>Ñ Iniciou</small></div></div>
            </div>

            {/* --- TABELA PRINCIPAL --- */}
            <div className="card border-0 shadow-sm">
                <div className="table-responsive">
                    <table className="table table-hover table-sm table-ultra-compact align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>Empresa</th>
                                <th>Rota</th>
                                <th>Veículo</th>
                                <th>Prev. Ini</th>
                                <th>Real Início</th>
                                <th title="Horário Programado Original">Prog. Fim</th>
                                <th title="Calculado Automaticamente (TomTom)">Prev. Fim (Real)</th>
                                <th>Ult. Reporte</th>
                                <th>Status</th>
                                <th className="text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} className="text-center py-3">Carregando dados da frota...</td></tr>
                            ) : dadosFiltrados.map((l, idx) => {
                                const previsao = getPrevisaoInteligente(l);
                                const valSentido = Number(l.s);
                                const jaSaiu = l.ri && l.ri !== 'N/D';

                                let statusBadge;
                                if (l.c === 'Carro desligado') statusBadge = <span className="badge bg-secondary badge-pill">Desligado</span>;
                                else if (!jaSaiu) statusBadge = l.pi < horaServidor ? <span className="badge bg-danger badge-pill">Atrasado (Ini)</span> : <span className="badge bg-light text-dark border">Aguardando</span>;
                                else statusBadge = isLineAtrasada(l) ? <span className="badge bg-danger badge-pill">Atrasado</span> : <span className="badge bg-success badge-pill">Pontual</span>;

                                return (
                                    <tr key={`${l.id}-${idx}`}>
                                        <td>{l.e}</td>
                                        <td>{l.r} {valSentido === 1 ? '➡️' : '⬅️'}</td>
                                        <td className="fw-bold text-primary">{l.v}</td>
                                        <td className={!jaSaiu && l.pi < horaServidor ? 'text-danger' : ''}>{l.pi}</td>
                                        <td>{l.ri}</td>
                                        
                                        <td className="text-muted small">{l.pf}</td>

                                        {/* Prev. Fim (Real) */}
                                        <td className={previsao.classe}>
                                            {previsao.horario || 'N/D'}
                                            {previsao.origem === 'TomTom' && <i className="bi bi-broadcast ms-1 small blink-icon" title="Cálculo em Tempo Real (TomTom)"></i>}
                                        </td>

                                        <td className="small">{l.u}</td>
                                        <td>{statusBadge}</td>
                                        <td className="text-center">
                                            
                                            {/* BOTÃO CALCULAR INÍCIO (Clock) */}
                                            <button className="btn btn-outline-primary btn-sm rounded-circle me-1 p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi || '--:--'
                                            })}>
                                                <i className="bi bi-clock" style={{fontSize: 10}}></i>
                                            </button>
                                            
                                            {/* BOTÃO MAPA (Final) */}
                                            <button className="btn btn-primary btn-sm rounded-circle shadow-sm" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, 
                                                idLinha: l.id, 
                                                tipo: 'final', 
                                                // Passa o horário que está na tela, seja ele PF ou PFN (TomTom)
                                                pf: previsao.horario || 'N/D' 
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

            {/* Modal */}
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
