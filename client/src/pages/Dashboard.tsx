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
    pf: string; // prog fim (Estático)
    pfn?: string; // Previsão Fim Nova (Dinâmico / TomTom)
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

    const [selectedMap, setSelectedMap] = useState<{
        placa: string, 
        idLinha: string, 
        tipo: 'inicial'|'final',
        pf: string 
    } | null>(null);

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
            
            // Correção do filtro de sentido (conforme conversa anterior)
            if (filtroSentido) {
                const sNumber = Number(l.s);
                const sentidoStr = sNumber === 1 ? 'ida' : 'volta';
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

    const kpis = useMemo(() => {
        let counts = { total: 0, atrasados: 0, pontual: 0, desligados: 0, deslocamento: 0, semInicio: 0 };
        
        linhas.forEach(l => {
            counts.total++;
            if (l.c === 'Carro desligado') { 
                counts.desligados++; 
                return; 
            }
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

    // --- NOVA LÓGICA DE VISUALIZAÇÃO DE PREVISÃO ---

    /**
     * Determina qual horário exibir e a cor.
     * Prioridade: 
     * 1. TomTom (pfn)
     * 2. Programado (pf)
     */
    const getDisplayPrevisao = (linha: Linha) => {
        // Verifica se existe previsão dinâmica (TomTom) válida
        const temTomTom = linha.pfn && linha.pfn !== 'N/D' && linha.pfn !== '--:--';
        
        const horarioExibido = temTomTom ? linha.pfn : linha.pf;
        const horarioProgramado = linha.pf;

        // Cálculo de cor baseado em atraso
        let classeCor = '';
        if (temTomTom && horarioProgramado) {
            // Se a previsão do TomTom for maior que o programado => Atraso
            if (horarioExibido! > horarioProgramado) {
                classeCor = 'text-danger fw-bold';
            } else {
                classeCor = 'text-success fw-bold';
            }
        } else {
            // Se está usando o estático, cor neutra ou warning
            classeCor = 'text-muted';
        }

        return { 
            horario: horarioExibido, 
            classe: classeCor,
            isRealTime: temTomTom // Flag para mostrar ícone de sinal
        };
    };

    return (
        <div className="container-fluid pt-3">
             {/* ... (Header e Filtros mantidos iguais) ... */}
            
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
                                    {/* Coluna ajustada para indicar fonte da informação */}
                                    <th title="Baseado em Tráfego Real (TomTom)">Prev. Chegada</th>
                                    <th>Ult. Reporte</th>
                                    <th>Status</th>
                                    <th className="text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={11}>Carregando...</td></tr>
                                ) : dadosFiltrados.length === 0 ? (
                                    <tr><td colSpan={11} className="text-center py-4 text-muted">Nenhum veículo encontrado.</td></tr>
                                ) : (
                                    dadosFiltrados.map((l, idx) => {
                                        const atrasado = isLineAtrasada(l);
                                        const valSentido = Number(l.s);
                                        const iconSentido = valSentido === 1 
                                            ? <i className="bi bi-arrow-right-circle-fill text-primary ms-1"></i> 
                                            : <i className="bi bi-arrow-left-circle-fill text-warning ms-1"></i>;
                                        
                                        const jaSaiu = l.ri && l.ri !== 'N/D';
                                        
                                        // Usa a nova lógica de previsão
                                        const previsao = getDisplayPrevisao(l);

                                        let statusBadge;
                                        // ... (Lógica de badge mantida igual) ...
                                        if (l.c === 'Carro desligado') statusBadge = <span className="badge bg-secondary badge-pill">Desligado</span>;
                                        else if (!jaSaiu) {
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
                                                <td className="text-muted small">{l.pf}</td>
                                                
                                                {/* --- CÉLULA DA PREVISÃO ATUALIZADA --- */}
                                                <td className={previsao.classe}>
                                                    {previsao.horario || 'N/D'}
                                                    {/* Ícone indicando que é dado de GPS/TomTom */}
                                                    {previsao.isRealTime && (
                                                        <i className="bi bi-broadcast ms-1 small" title="Tempo Real (TomTom)" style={{fontSize: '0.7em'}}></i>
                                                    )}
                                                </td>
                                                {/* -------------------------------------- */}

                                                <td className="small">{l.u}</td>
                                                <td>{statusBadge}</td>
                                                <td className="text-center">
                                                    <button className="btn btn-outline-primary btn-sm rounded-circle me-1 p-0" style={{width:24, height:24}} onClick={() => setSelectedMap({placa: l.v, idLinha: l.id, tipo: 'inicial', pf: l.pi})}>
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
