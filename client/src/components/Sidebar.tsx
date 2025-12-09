import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface SidebarProps {
    isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    // Helper visual: Link Ativo
    const isActive = (path: string) => location.pathname === path ? 'active-link' : '';

    // Helper Lógico: Permissão
    const hasPermission = (menuKey: string) => {
        if (!currentUser) return false;
        // Se for admin, libera tudo. Se não, checa a lista (allowed_menus)
        if (currentUser.role === 'admin') return true;
        return currentUser.allowed_menus?.includes(menuKey);
    };

    return (
        <div 
            className="bg-white shadow-sm d-flex flex-column justify-content-between"
            style={{
                width: isOpen ? '250px' : '80px',
                height: '100vh',
                position: 'fixed',
                transition: 'width 0.3s ease',
                zIndex: 1000,
                overflowX: 'hidden',
                borderRight: '1px solid #dee2e6'
            }}
        >
            {/* --- 1. CABEÇALHO COM LOGO --- */}
            <div>
                <div className="d-flex align-items-center justify-content-center border-bottom bg-white" style={{ height: '80px' }}>
                     {isOpen ? (
                        // Logo Grande (Aberto)
                        <img 
                            src="https://viacaomimo.com.br/wp-content/uploads/2023/07/Logo.png" 
                            alt="Viação Mimo" 
                            style={{ maxHeight: '50px', maxWidth: '180px' }} 
                        />
                     ) : (
                        // Logo Pequeno / Texto (Fechado)
                        <small className="fw-bold text-primary">MIMO</small>
                     )}
                </div>

                {/* --- 2. LISTA DE MENUS --- */}
                <div className="list-group list-group-flush mt-2 p-2">
                    
                    {/* Dashboard */}
                    {hasPermission('dashboard') && (
                        <Link to="/" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/')}`} title="Dashboard">
                            <i className="bi bi-speedometer2 fs-5 me-3"></i>
                            {isOpen && <span>Dashboard</span>}
                        </Link>
                    )}

                    {/* Rotas */}
                    {hasPermission('rotas') && (
                        <Link to="/rotas" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/rotas')}`} title="Rotas">
                            <i className="bi bi-map fs-5 me-3"></i>
                            {isOpen && <span>Rotas</span>}
                        </Link>
                    )}

                    {/* Escala */}
                    {hasPermission('escala') && (
                        <Link to="/escala" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/escala')}`} title="Escala">
                            <i className="bi bi-calendar-week fs-5 me-3"></i>
                            {isOpen && <span>Escala</span>}
                        </Link>
                    )}

                    {/* Power B.I (Relatórios) */}
                    {hasPermission('relatorios') && (
                        <Link to="/relatorios" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/relatorios')}`} title="Power B.I">
                            <i className="bi bi-bar-chart-line fs-5 me-3"></i>
                            {isOpen && <span>Power B.I</span>}
                        </Link>
                    )}

                    {/* Divisor Admin */}
                    {currentUser?.role === 'admin' && isOpen && <hr className="my-2 mx-3 text-muted" />}

                    {/* Usuários (Apenas Admin) */}
                    {currentUser?.role === 'admin' && (
                        <Link to="/admin/usuarios" className={`list-group-item list-group-item-action border-0 rounded mb-1 ${isActive('/admin/usuarios')}`} title="Usuários">
                            <i className="bi bi-people fs-5 me-3"></i>
                            {isOpen && <span>Usuários</span>}
                        </Link>
                    )}
                </div>
            </div>

            {/* --- 3. RODAPÉ (PERFIL + SAIR) --- */}
            <div className="p-3 border-top bg-light">
                <div className="d-flex align-items-center mb-3 px-2 text-muted" style={{ overflow: 'hidden' }}>
                    <div className="bg-white rounded-circle p-2 shadow-sm me-3 d-flex align-items-center justify-content-center" style={{width: 40, height: 40}}>
                        <i className="bi bi-person-fill fs-5 text-secondary"></i>
                    </div>
                    
                    {isOpen && (
                        <div className="d-flex flex-column" style={{ lineHeight: '1.2' }}>
                            <small className="fw-bold text-dark text-truncate" style={{ maxWidth: '140px' }}>
                                {currentUser?.full_name?.split(' ')[0]}
                            </small>
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {currentUser?.role === 'admin' ? 'Administrador' : 'Colaborador'}
                            </small>
                        </div>
                    )}
                </div>

                <button 
                    onClick={handleLogout} 
                    className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center btn-sm"
                    title="Sair do Sistema"
                >
                    <i className="bi bi-box-arrow-left fs-6"></i>
                    {isOpen && <span className="ms-2">Sair</span>}
                </button>
            </div>

            {/* --- ESTILOS CSS INLINE --- */}
            <style>
                {`
                .active-link {
                    background-color: #e3f2fd !important; /* Azul bem claro */
                    color: #0d6efd !important; /* Azul Bootstrap */
                    font-weight: 600;
                    border-left: 4px solid #0d6efd !important;
                }
                .list-group-item-action {
                    transition: all 0.2s ease-in-out;
                    color: #6c757d; /* Cinza suave */
                }
                .list-group-item-action:hover {
                    background-color: #f8f9fa;
                    color: #0d6efd;
                    transform: translateX(3px);
                }
                `}
            </style>
        </div>
    );
};

export default Sidebar;
