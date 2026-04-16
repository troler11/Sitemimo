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
    obs: string;
    ra_val: string;
    manutencao: string;
    aguardando: string;
}

const Escala: React.FC = () => {
    const [dados, setDados] = useState<ItemEscala[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroData, setFiltroData] = useState(new Date().toLocaleDateString('pt-BR'));
    
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus, setFiltroStatus] = useState(''); 
    const [busca, setBusca] = useState('');

    // --- NOVOS ESTADOS PARA EDIÇÃO ---
    const [linhaEmEdicao, setLinhaEmEdicao] = useState<number | null>(null);
    const [formEdicao, setFormEdicao] = useState({ frota_enviada: '', motorista: '' });
    const [salvando, setSalvando] = useState(false);

    const fetchData = useCallback(async (isAutoUpdate = false) => {
        // Não mostra loading se for atualização automática ou se estiver editando uma linha
        if (!isAutoUpdate && linhaEmEdicao === null) setLoading(true);
        try {
            const res = await api.get('/escala', { params: { data: filtroData } });
            setDados(res.data);
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
            // Só atualiza automaticamente se não estiver no meio de uma edição (para não bugar o input)
            if (linhaEmEdicao === null) {
                fetchData(true); 
            }
        }, 60000);
        return () => clearInterval(intervalo);
    }, [fetchData, linhaEmEdicao]);

    const empresasUnicas = useMemo(() => {
        return Array.from(new Set(dados.map(d => d.empresa))).sort();
    }, [dados]);

    const dadosFiltrados = useMemo(() => {
        return dados.filter(item => {
            if (filtroEmpresa && item.empresa !== filtroEmpresa) return false;
            
            const realizou = item.ra_val && String(item.ra_val).trim() !== '' && String(item.ra_val).trim() !== '0';
            const obsTexto = (item.obs || '').toLowerCase();
            const isCobrir = obsTexto.includes('cobrir');

            let statusItem = 'pendente';
           if (item.manutencao) {
            statusItem = 'manutencao';
        } else if (item.aguardando) {
            statusItem = 'aguardando';
        } else if (realizou) {
            statusItem = 'confirmado';
        }
            
            if (filtroStatus) {
                if (filtroStatus === 'cobrir') {
                    if (!isCobrir) return false;
                } else if (filtroStatus !== statusItem) {
                    return false;
                }
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
    const iniciarEdicao = (index: number, row: ItemEscala) => {
        setLinhaEmEdicao(index);
        setFormEdicao({
            frota_enviada: row.frota_enviada !== '---' ? row.frota_enviada : '',
            motorista: row.motorista
        });
    };

    const cancelarEdicao = () => {
        setLinhaEmEdicao(null);
    };

    const salvarEdicao = async (row: ItemEscala) => {
        setSalvando(true);
        try {
            // Aqui enviamos para a sua API. 
            // Você precisa enviar algo que identifique a linha exata no Sheets (ex: data, empresa, rota, h_prog)
            await api.put('/escala/atualizar', {
                data_escala: filtroData,
                empresa: row.empresa,
                rota: row.rota,
                h_prog: row.h_prog,
                novo_motorista: formEdicao.motorista,
                nova_frota: formEdicao.frota_enviada
            });
            
            setLinhaEmEdicao(null);
            fetchData(false); // Recarrega os dados atualizados
        } catch (err) {
            console.error("Erro ao salvar edição:", err);
            alert("Ocorreu um erro ao salvar as alterações.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="main-content">
            {/* O cabeçalho, KPIs e Filtros continuam exatamente iguais... */}
            {/* (Vou omitir os divs superiores aqui na visualização para focar na tabela, mas MANTENHA o seu código original lá) */}
            
            {/* Cole tudo do <div className="header-flex mb-4"> até o final de <div className="filters-flex mb-4"> que já existe no seu código aqui */}

            <div className="table-responsive table-card">
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th style={{width: '25%'}}>Empresa / Rota</th>
                            <th className="text-center" style={{width: '15%'}}>Frota</th>
                            <th style={{width: '20%'}}>Motorista</th>
                            <th style={{width: '15%'}}>Detalhes</th>
                            <th className="text-center" style={{width: '10%'}}>Status</th>
                            <th className="text-end" style={{width: '10%'}}>Horário</th>
                            <th className="text-center" style={{width: '5%'}}>Ações</th> {/* Nova coluna */}
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
                                const emEdicao = linhaEmEdicao === i; // Verifica se a linha atual está sendo editada
                                
                                return (
                                    <tr key={i} className={emEdicao ? 'table-warning' : ''}>
                                        <td>
                                            <div className="fw-bold text-dark">{row.empresa}</div>
                                            <div className="text-muted small text-truncate" style={{maxWidth: '250px'}} title={row.rota}>
                                                {row.rota}
                                            </div>
                                        </td>
                                        
                                        {/* COLUNA: FROTA */}
                                        <td className="text-center">
                                            {emEdicao ? (
                                                <input 
                                                    type="text" 
                                                    className="form-control form-control-sm text-center border-warning" 
                                                    value={formEdicao.frota_enviada} 
                                                    onChange={e => setFormEdicao({...formEdicao, frota_enviada: e.target.value})}
                                                    placeholder="Nova Frota"
                                                    autoFocus
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
                                        
                                        {/* COLUNA: MOTORISTA */}
                                        <td>
                                            {emEdicao ? (
                                                <input 
                                                    type="text" 
                                                    className="form-control form-control-sm border-warning" 
                                                    value={formEdicao.motorista} 
                                                    onChange={e => setFormEdicao({...formEdicao, motorista: e.target.value})}
                                                    placeholder="Novo Motorista"
                                                />
                                            ) : (
                                                <>
                                                    <div className="d-flex align-items-center">
                                                        <div className="fw-bold text-dark small">{row.motorista}</div>
                                                    </div>
                                                    {row.reserva && <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Reserva: {row.reserva}</small>}
                                                </>
                                            )}
                                        </td>

                                        {/* COLUNAS EXISTENTES (Detalhes, Status, Horário) */}
                                        <td>
                                            <div className="d-flex flex-column">
                                                {row.obs && (
                                                    <small className="fst-italic" style={{color: isCobrir ? '#6f42c1' : '#6c757d', fontWeight: isCobrir ? 'bold' : 'normal'}}>
                                                        {isCobrir && <i className="fas fa-sync-alt me-1"></i>}
                                                        {row.obs}
                                                    </small>
                                                )}
                                                {realizou && <small className="text-green fw-bold mt-1">RA: {row.ra_val}</small>}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            {row.manutencao ? <span className="badge badge-red">Manutenção</span> :
                                             realizou ? <span className="badge badge-green">Confirmado</span> :
                                             row.aguardando ? <span className="badge badge-warning text-dark">Aguardando</span> :
                                             <span className="badge badge-gray">Pendente</span>}
                                        </td>
                                        <td className="text-end">
                                            <div className="small text-muted">Prog: {row.h_prog}</div>
                                            {(row.h_real && row.h_real.length > 2) && (
                                                <div className={row.h_real > row.h_prog ? 'text-red fw-bold small' : 'text-green fw-bold small'}>
                                                    Real: {row.h_real}
                                                </div>
                                            )}
                                        </td>

                                        {/* COLUNA: AÇÕES (BOTÃO EDITAR/SALVAR) */}
                                        <td className="text-center">
                                            {emEdicao ? (
                                                <div className="d-flex gap-1 justify-content-center">
                                                    <button 
                                                        className="btn btn-sm btn-success" 
                                                        title="Salvar" 
                                                        onClick={() => salvarEdicao(row)}
                                                        disabled={salvando}
                                                    >
                                                        {salvando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-danger" title="Cancelar" onClick={cancelarEdicao} disabled={salvando}>
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-sm text-primary" title="Editar Motorista/Frota" onClick={() => iniciarEdicao(i, row)}>
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
