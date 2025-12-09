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
    pfn?: string; // Previsão TomTom
    u: string;  // update
    c: string;  // status
}

const Dashboard: React.FC = () => {
    // ... (Estados e Filtros omitidos, são os mesmos)
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [loading, setLoading] = useState(true);
    const [horaServidor, setHoraServidor] = useState('00:00');
    
    const [selectedMap, setSelectedMap] = useState<{
        placa: string, idLinha: string, tipo: 'inicial'|'final', pf: string 
    } | null>(null);

    // 1. CARREGAMENTO PRINCIPAL COM PRESERVAÇÃO DE ESTADO (OK)
    const fetchData = async () => {
        try {
            const res = await api.get('/dashboard');
            const linhasServidor: Linha[] = res.data.todas_linhas || [];
            
            // Fusão: Preserva o PFN local se o servidor enviar cache vazio
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
        } catch (error) {
            console.error("Erro dashboard", error);
        }
    };

    // 2. FUNÇÃO DE CÁLCULO DE PREVISÕES INDIVIDUAIS (BACKGROUND)
    const carregarPrevisoesAutomaticamente = useCallback(async () => {
        const linhasAtivas = linhas.filter(l => 
            l.ri && l.ri !== 'N/D' && 
            l.c !== 'Carro desligado' && 
            l.c !== 'Encerrado'
        );

        if (linhasAtivas.length === 0) return;

        await Promise.allSettled(linhasAtivas.map(async (linha) => {
            try {
                // >>> MUDANÇA AQUI: Adiciona o Cache Buster <<<
                const cacheBuster = Date.now();
                const res = await api.get(`/rota/final/${linha.v}`, { 
                    params: { 
                        idLinha: linha.id,
                        cache: cacheBuster // Parâmetro único para evitar cache
                    } 
                });

                const novaPrevisao: string = res.data.previsao_chegada;
                
                // >>> LOGGING PARA DEPURAÇÃO <<<
                console.log(`[PREVISÃO] Veículo: ${linha.v} | Rota: ${linha.r} | Servidor Retornou: ${novaPrevisao} (Deve ser o TomTom)`);

                if (novaPrevisao && novaPrevisao !== 'N/D') {
                    setLinhas(prevLinhas => prevLinhas.map(item => 
                        item.id === linha.id ? { ...item, pfn: novaPrevisao } : item
                    ));
                }
            } catch (err) {
                console.warn(`[ERRO] Falha ao atualizar TomTom para ${linha.v}:`, err);
            }
        }));
    }, [linhas]);

    // 3. Loops de Refresh (os mesmos)
    useEffect(() => {
        fetchData();
        const intervalPrincipal = setInterval(fetchData, 30000); 
        return () => clearInterval(intervalPrincipal);
    }, []);

    useEffect(() => {
        if (!loading && linhas.length > 0) {
            // Roda uma vez imediatamente após o carregamento inicial da lista
            carregarPrevisoesAutomaticamente(); 

            const intervalPrevisao = setInterval(() => {
                carregarPrevisoesAutomaticamente();
            }, 60000); 
            
            return () => clearInterval(intervalPrevisao);
        }
    }, [loading, linhas.length, carregarPrevisoesAutomaticamente]);


    // --- LÓGICA DE EXIBIÇÃO --- (Mantida)

    const empresasUnicas = useMemo(() => [...new Set(linhas.map(l => l.e).filter(Boolean))].sort(), [linhas]);

    const dadosFiltrados = useMemo(() => {
        // ... (Filtros omitidos)
        return linhas.filter(l => true); 
    }, [linhas, busca, filtroEmpresa, filtroSentido, filtroStatus]);

    const kpis = useMemo(() => {
        // ... (KPIs omitidos)
        return { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
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
            {/* ... (JSX de Filtros e KPIs) ... */}
            
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
                                // ... (Status e Sentido omitidos)

                                return (
                                    <tr key={`${l.id}-${idx}`}>
                                        <td>{l.e}</td>
                                        <td>{l.r} {Number(l.s) === 1 ? '➡️' : '⬅️'}</td>
                                        <td className="fw-bold text-primary">{l.v}</td>
                                        <td>{l.pi}</td>
                                        <td>{l.ri}</td>
                                        
                                        <td className="text-muted small">{l.pf}</td>

                                        {/* Prev. Fim (Real) */}
                                        <td className={previsao.classe}>
                                            {previsao.horario || 'N/D'}
                                            {previsao.origem === 'TomTom' && <i className="bi bi-broadcast ms-1 small blink-icon" title="Cálculo em Tempo Real (TomTom)"></i>}
                                        </td>

                                        <td className="small">{l.u}</td>
                                        <td>{l.c}</td> 
                                        <td className="text-center">
                                            
                                            {/* Botão Calcular Início (Clock) */}
                                            <button className="btn btn-outline-primary btn-sm rounded-circle me-1 p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi || '--:--'
                                            })}>
                                                <i className="bi bi-clock" style={{fontSize: 10}}></i>
                                            </button>
                                            
                                            {/* Botão Mapa (Final) */}
                                            <button className="btn btn-primary btn-sm rounded-circle shadow-sm" style={{width:24, height:24}} onClick={() => setSelectedMap({
                                                placa: l.v, idLinha: l.id, tipo: 'final', pf: l.pf
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
