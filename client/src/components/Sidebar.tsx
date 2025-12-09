import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css'; // Importa o visual original

interface SidebarProps {
    isOpen: boolean; // Controla se está expandida (250px) ou recolhida (80px)
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const location = useLocation();
    const navigate = useNavigate();
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = user.role || '';
    const permissoes = user.menus || [];

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const menus = [
        { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/' },
        { key: 'rotas', label: 'Rotas', icon: 'bi-map', link: '/rotas' },
        { key: 'veiculos', label: 'Veículos', icon: 'bi-bus-front', link: '/veiculos' },
        { key: 'motoristas', label: 'Motoristas', icon: 'bi-person-vcard', link: '/motoristas' },
        { key: 'escala', label: 'Escala', icon: 'bi-calendar-week', link: '/escala' },
        { key: 'relatorios', label: 'Power BI', icon: 'bi-file-earmark-text', link: '/relatorios' },
        { key: 'usuarios', label: 'Usuários', icon: 'bi-people-fill', link: '/admin/usuarios' }
    ];

    // A classe 'toggled' é adicionada se isOpen for falso
    const sidebarClass = isOpen ? 'sidebar' : 'sidebar toggled';

    return (
        <div className={sidebarClass} id="sidebar">
            {/* Logo */}
            <div className="logo-container">
                <img 
                    src="https://viacaomimo.com.br/wp-content/uploads/2023/07/Background-12-1.png" 
                    alt="Logo" 
                />
            </div>

            {/* Links */}
            {menus.map((menu) => {
                const temPermissao = role === 'admin' || permissoes.includes(menu.key);
                if (!temPermissao) return null;

                // Verifica se é a página atual para pintar de azul
                const isActive = location.pathname === menu.link;

                return (
                    <Link 
                        to={menu.link} 
                        key={menu.key} 
                        className={isActive ? 'active' : ''}
                        title={menu.label}
                    >
                        <i className={`bi ${menu.icon} me-2`}></i>
                        <span>{menu.label}</span>
                    </Link>
                );
            })}

            {/* Botão Sair */}
            <a href="#" onClick={handleLogout} className="mt-auto logout-link" title="Sair">
                <i className="bi bi-box-arrow-right me-2"></i>
                <span>Sair</span>
            </a>
        </div>
    );
};

export default Sidebar;
