import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './RoutesList.css'; 
import Swal from 'sweetalert2';

// Interface dos dados
interface Rota {
    id: number;
    descricao: string;
    codigo: string;
    empresa: string;
    dias_operacao: boolean[]; 
    pontos_rota?: {
        ordem: number;
        horario: string;
        nome: string;
    }[];
}

const RoutesList: React.FC = () => {
    const navigate = useNavigate();
    const [rotas, setRotas] = useState<Rota[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // --- NOVO: Estado para controlar qual menu está aberto ---
    const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

    const toggleDropdown = (id: number) => {
        if (openDropdownId === id) {
            setOpenDropdownId(null);
        } else {
            setOpenDropdownId(id);
        }
    };

    // Fecha o menu se clicar fora (opcional, mas melhora a UX)
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdownId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);
    // ---------------------------------------------------------

    useEffect(() => {
        fetchRotas();
    }, []);

    const fetchRotas = async () => {
        try {
            const response = await api.get('/rotas');
            setRotas(response.data);
        } catch (error) {
            console.error('Erro ao buscar rotas', error);
            Swal.fire('Erro', 'Não foi possível carregar a lista.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const formatDias = (dias: boolean[]) => {
        if (!dias || dias.length === 0) return '-';
        const labels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const ativos = dias.map((ativo, index) => ativo ? labels[index] : null).filter(d => d !== null);
        
        if (ativos.length === 5 && ativos.includes('SEG') && ativos.includes('SEX')) return 'SEG a SEX';
        return ativos.join(', ');
    };

    const getHorarios = (rota: Rota) => {
        if (!rota.pontos_rota || rota.pontos_rota.length === 0) return { inicio: '--:--', fim: '--:--', origem: '-', destino: '-' };
        const pontosOrdenados = [...rota.pontos_rota].sort((a, b) => a.ordem - b.ordem);
        const primeiro = pontosOrdenados[0];
        const ultimo = pontosOrdenados[pontosOrdenados.length - 1];
        return {
            inicio: primeiro.horario,
            fim: ultimo.horario,
            origem: primeiro.nome,
            destino: ultimo.nome
        };
    };

    const filteredRotas = rotas.filter(r => 
        r.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.empresa.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // FUNÇÃO PARA DELETAR
    const handleDelete = async (id: number) => {
        // Confirmação visual
        const result = await Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter isso! A rota e todos os seus pontos serão apagados.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, excluir!',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`/rotas/${id}`);
                Swal.fire('Excluído!', 'A rota foi removida.', 'success');
                fetchRotas(); // Recarrega a lista para sumir com o item
            } catch (error) {
                console.error(error);
                Swal.fire('Erro', 'Não foi possível excluir.', 'error');
            }
        }
    };

    return (
        <div className="main-content">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h5 className="page-title mb-1">Gerenciamento de Linhas</h5>
                    <small className="text-muted">Cadastros / Linhas</small>
                </div>
                <button className="btn btn-success btn-circle" onClick={() => navigate('/rotas/nova')} title="Nova Linha">
                    <i className="fas fa-plus"></i>
                </button>
            </div>

            <div className="card-table-container">
                <div className="toolbar-flex">
                    <div className="actions-left">
                        <button className="btn btn-outline-secondary btn-sm me-2"><i className="far fa-file-excel me-1"></i> Exportação Excel</button>
                    </div>
                    <div className="search-right">
                        <div className="input-group input-group-sm">
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="Procurar..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <span className="input-group-text bg-white"><i className="fas fa-search"></i></span>
                        </div>
                    </div>
                </div>

                <div className="table-responsive" style={{ minHeight: '400px', overflow: 'visible' }}> 
                    <table className="table table-hover align-middle custom-table">
                        <thead>
                            <tr>
                                <th style={{width: '40px'}}><input type="checkbox" className="form-check-input" /></th>
                                <th>Ativa</th>
                                <th>Linha / Descrição</th>
                                <th>Código</th>
                                <th>Origem / Destino</th>
                                <th>Empresa</th>
                                <th>Horários</th>
                                <th>Dias</th>
                                <th className="text-end">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-5">Carregando dados...</td></tr>
                            ) : filteredRotas.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-5">Nenhuma linha encontrada.</td></tr>
                            ) : filteredRotas.map(rota => {
                                const info = getHorarios(rota);
                                return (
                                    <tr key={rota.id}>
                                        <td><input type="checkbox" className="form-check-input" /></td>
                                        <td><span className="badge bg-success-subtle text-success">Sim</span></td>
                                        <td>
                                            <div className="fw-bold text-dark">{rota.descricao}</div>
                                            <small className="text-muted" style={{fontSize: '0.75rem'}}>REF: {rota.id}</small>
                                        </td>
                                        <td><span className="badge bg-light text-dark border">{rota.codigo}</span></td>
                                        <td>
                                            <div className="d-flex flex-column small">
                                                <span className="text-truncate" style={{maxWidth: '200px'}} title={info.origem}>
                                                    <i className="fas fa-map-marker-alt text-danger me-1"></i> {info.origem}
                                                </span>
                                                <span className="text-truncate" style={{maxWidth: '200px'}} title={info.destino}>
                                                    <i className="fas fa-flag-checkered text-success me-1"></i> {info.destino}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{rota.empresa}</td>
                                        <td>
                                            <div className="d-flex gap-2 small">
                                                <span className="badge bg-primary-subtle text-primary">{info.inicio}</span>
                                                <i className="fas fa-arrow-right text-muted" style={{fontSize: '0.7rem', alignSelf:'center'}}></i>
                                                <span className="badge bg-warning-subtle text-dark">{info.fim}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="small text-muted">{formatDias(rota.dias_operacao)}</span>
                                        </td>
                                        
                                        {/* --- COLUNA DE AÇÕES COM DROPDOWN MANUAL --- */}
                                        <td className="text-end" style={{ position: 'relative' }}>
                                            <button 
                                                className="btn btn-link text-dark fw-bold text-decoration-none btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Impede que o click no botão feche o menu imediatamente
                                                    toggleDropdown(rota.id);
                                                }}
                                            >
                                                Opções <i className="fas fa-ellipsis-v ms-1"></i>
                                            </button>

                                            {openDropdownId === rota.id && (
                                                <div 
                                                    className="dropdown-menu show shadow" 
                                                    style={{
                                                        display: 'block', 
                                                        position: 'absolute', 
                                                        right: '100%', // Abre para a esquerda do botão
                                                        top: '0', 
                                                        zIndex: 9999
                                                    }}
                                                >
                                                    <button 
                                                        className="dropdown-item" 
                                                        onClick={() => navigate(`/rotas/editar/${rota.id}`)}
                                                    >
                                                        <i className="fas fa-edit me-2 text-primary"></i> Editar
                                                    </button>
    <button 
        className="dropdown-item text-danger"
        onClick={() => {
            setOpenDropdownId(null); 
            handleDelete(rota.id);
        }}
    >
        <i className="fas fa-trash-alt me-2"></i> Excluir
    </button>
                                                </div>
                                            )}
                                        </td>
                                        {/* ------------------------------------------- */}

                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                    <small className="text-muted">Mostrando {filteredRotas.length} registros</small>
                </div>
            </div>
        </div>
    );
};

export default RoutesList;
