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
    pf: string; // prog fim
    pfn?: string; // Previsão Fim Nova (TomTom)
    u: string;  // update
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

    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string 
    } | null>(null);

    // 1. --- CARREGAMENTO PRINCIPAL COM PRESERVAÇÃO DE ESTADO ---
    const fetchData = async () => {
        try {
            const res = await api.get('/dashboard');
            const linhasServidor: Linha[] = res.data.todas_linhas || [];
            
            // Usamos a função de callback do setLinhas para acessar o estado anterior (prevLinhas)
            setLinhas(prevLinhas => {
                if (prevLinhas.length === 0) return linhasServidor; // Primeira carga
                
                // Mapeia os dados do servidor e funde com os dados locais frescos
                return linhasServidor.map(serverLinha => {
                    const linhaAnterior = prevLinhas.find(l => l.id === serverLinha.id);
                    
                    // Condição de Fusão:
                    // Se o servidor não enviou uma previsão (pfn é falsy: null, undefined, "") 
                    // E nós tínhamos uma previsão fresca localmente, mantemos a previsão local.
                    if (!serverLinha.pfn && linhaAnterior?.pfn) {
                        return { ...serverLinha, pfn: linhaAnterior.pfn };
                    }
                    
                    // Caso contrário, usamos o que o servidor enviou
                    return serverLinha;
                });
            });

            if(res.data.hora) setHoraServidor(res.data.hora);
            setLoading(false);
        } catch (error) {
            console.error("Erro dashboard", error);
        }
    };

    // 2. --- FUNÇÃO DE CÁLCULO DE PREVISÕES INDIVIDUAIS (BACKGROUND) ---
    const carregarPrevisoesAutomaticamente = useCallback(async () => {
        // Filtra apenas linhas que estão rodando e não estão encerradas/desligadas
        const linhasAtivas = linhas.filter(l => 
            l.ri && l.ri !== 'N/D' && 
            l.c !== 'Carro desligado' && 
            l.c !== 'Encerrado'
        );

        if (linhasAtivas.length === 0) return;

        console.log(`Atualizando previsões em tempo real de ${linhasAtivas.length} veículos...`);

        // Processa as atualizações em paralelo (com segurança contra falhas individuais)
        await Promise.allSettled(linhasAtivas.map(async (linha) => {
            try {
                // Endpoint que faz o cálculo real (TomTom/Mapa)
                const res = await api.get(`/rota/final/${linha.v}`, { 
                    params: { idLinha: linha.id } 
                });

                const novaPrevisao = res.data.previsao_chegada;

                if (novaPrevisao) {
                    // Atualiza o estado usando o callback para garantir que pega o estado mais recente (prevLinhas)
                    setLinhas(prevLinhas => prevLinhas.map(item => 
                        item.id === linha.id ? { ...item, pfn: novaPrevisao } : item
                    ));
                }
            } catch (err) {
                // Ignora falhas de rede/API para um carro específico
            }
        }));
    }, [linhas]);

    // 3. Loops de Refresh
    useEffect(() => {
        fetchData();
        const intervalPrincipal = setInterval(fetchData, 30000); 
        return () => clearInterval(intervalPrincipal);
    }, []);

    useEffect(() => {
        if (!loading && linhas.length > 0) {
            const intervalPrevisao = setInterval(() => {
                carregarPrevisoesAutomaticamente();
            }, 60000); // 60 segundos para atualização das previsões de tráfego
            
            return () => clearInterval(intervalPrevisao);
        }
    }, [loading, linhas.length, carregarPrevisoesAutomaticamente]);


    // --- LÓGICA DE EXIBIÇÃO ---

    const empresasUnicas = useMemo(() => [...new Set(linhas.map(l => l.e).filter(Boolean))].sort(), [linhas]);

    const dadosFiltrados = useMemo(() => {
        return linhas.filter(l => {
            if (busca && !`${l.e} ${l.r} ${l.v}`.toLowerCase().includes(busca.toLowerCase())) return false;
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

    return (
        <div className="container-fluid pt-3">
            {/* ... (JSX de Filtros e KPIs omitido) ... */}
            <div className="row g-3 mb-4">{/* KPIs */}</div>
            
            {/* Tabela */}
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
                                <th title="Calculado Automaticamente">Prev. Fim (Real)</th>
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

                                return (
                                    <tr key={`${l.id}-${idx}`}>
                                        <td>{l.e}</td>
                                        <td>{l.r} {Number(l.s) === 1 ? '➡️' : '⬅️'}</td>
                                        <td className="fw-bold text-primary">{l.v}</td>
                                        <td>{l.pi}</td>
                                        <td>{l.ri}</td>
                                        
                                        <td className="text-muted small">{l.pf}</td>

                                        {/* Prev. Fim (Real) - Célula que mostra os dados injetados */}
                                        <td className={previsao.classe}>
                                            {previsao.horario || 'N/D'}
                                            {previsao.origem === 'TomTom' && <i className="bi bi-broadcast ms-1 small blink-icon"></i>}
                                        </td>

                                        <td className="small">{l.u}</td>
                                        <td>{l.c}</td> {/* Status Badge omitido para brevidade */}
                                        <td className="text-center">
                                            {/* Botão Mapa */}
                                            <button className="btn btn-primary btn-sm rounded-circle shadow-sm" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf // Passa o PF original para o modal comparar
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

function isLineAtrasada(l: Linha): boolean {
    const tolerancia = 10;
    if (!l.pi || l.pi === 'N/D' || !l.ri || l.ri === 'N/D') return false;
    const [hP, mP] = l.pi.split(':').map(Number);
    const [hR, mR] = l.ri.split(':').map(Number);
    return (hR * 60 + mR) - (hP * 60 + mP) > tolerancia;
}

export default Dashboard;
