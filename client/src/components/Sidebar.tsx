import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom'; // Importe useLocation para destacar menu ativo
import { useAuth } from '../hooks/useAuth';

interface SidebarProps {
    isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation(); // Para saber em qual página estamos

    const handleLogout = () => {
        logout(); // Limpa token e estado
        navigate('/login', { replace: true }); // Força ida para o login
    };

    // Função para verificar se o link está ativo
    const isActive = (path: string) => location.pathname === path ? 'active-link' : '';

    return (
        <div 
            className="bg-white shadow-sm d-flex flex-column justify-content-between"
            style={{
                width: isOpen ? '250px' : '80px',
                height: '100vh',
                position: 'fixed',
                transition: 'width 0.3s ease',
                zIndex: 1000,
                overflowX: 'hidden' // Evita scroll horizontal na animação
            }}
        >
            {/* Topo: Logo e Links */}
            <div>
                <div className="p-3 d-flex align-items-center justify-content-center border-bottom" style={{ height: '70px' }}>
                     {/* Você pode colocar um Logo aqui */}
                     <h5 className="m-0 text-primary fw-bold text-nowrap">
                        {isOpen ? 'SISTEMA FROTA' : 'SF'}
                     </h5>
                </div>

                <div className="list-group list-group-flush mt-3 p-2">
                    {/* Link Dashboard */}
                    <Link to="/" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/')}`} title="Dashboard">
                        <i className="bi bi-speedometer2 fs-5 me-3"></i>
                        {isOpen && <span>Dashboard</span>}
                    </Link>

                    {/* Link Rotas */}
                    {/* Exibe se for Admin OU se tiver permissão de rotas */}
                    {(currentUser?.role === 'admin' || currentUser?.allowed_menus?.includes('rotas')) && (
                        <Link to="/rotas" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/rotas')}`} title="Rotas">
                            <i className="bi bi-map fs-5 me-3"></i>
                            {isOpen && <span>Rotas</span>}
                        </Link>
                    )}

                    {/* Link Escala */}
                    {(currentUser?.role === 'admin' || currentUser?.allowed_menus?.includes('escala')) && (
                        <Link to="/escala" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/escala')}`} title="Escala">
                            <i className="bi bi-calendar-week fs-5 me-3"></i>
                            {isOpen && <span>Escala</span>}
                        </Link>
                    )}

                    {/* Link Usuários (Apenas Admin) */}
                    {currentUser?.role === 'admin' && (
                        <Link to="/admin/usuarios" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/admin/usuarios')}`} title="Usuários">
                            <i className="bi bi-people fs-5 me-3"></i>
                            {isOpen && <span>Usuários</span>}
                        </Link>
                    )}
                </div>
            </div>

            {/* Rodapé: Botão Sair */}
            <div className="p-3 border-top">
                <div className="d-flex align-items-center mb-3 px-2 text-muted" style={{ overflow: 'hidden' }}>
                    <i className="bi bi-person-circle fs-4 me-3"></i>
                    {isOpen && (
                        <div className="d-flex flex-column" style={{ lineHeight: '1.2' }}>
                            <small className="fw-bold text-truncate" style={{ maxWidth: '140px' }}>
                                {currentUser?.full_name?.split(' ')[0]} {/* Primeiro nome */}
                            </small>
                            <small style={{ fontSize: '0.75rem' }}>{currentUser?.role}</small>
                        </div>
                    )}
                </div>

                <button 
                    onClick={handleLogout} 
                    className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center"
                    title="Sair do Sistema"
                >
                    <i className="bi bi-box-arrow-left fs-5"></i>
                    {isOpen && <span className="ms-2">Sair</span>}
                </button>
            </div>

            {/* CSS inline para o link ativo (pode mover para um arquivo .css) */}
            <style>
                {`
                .active-link {
                    background-color: #e9ecef !important;
                    color: #0d6efd !important;
                    font-weight: 500;
                }
                `}
            </style>
        </div>
    );
};

export default Sidebar;
