import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Sidebar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Recupera dados do usuário salvos no login
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = user.role || '';
    const permissoes = user.menus || [];

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Definição dos menus (igual ao seu PHP array)
    const menus = [
        { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/' },
        { key: 'rotas', label: 'Rotas', icon: 'bi-map', link: '/rotas' },
        { key: 'veiculos', label: 'Veículos', icon: 'bi-bus-front', link: '/veiculos' },
        { key: 'escala', label: 'Escala', icon: 'bi-calendar-week', link: '/escala' },
        { key: 'relatorios', label: 'Power BI', icon: 'bi-file-earmark-text', link: '/relatorios' },
        { key: 'usuarios', label: 'Usuários', icon: 'bi-people-fill', link: '/admin' }
    ];

    return (
        <div className="d-flex flex-column flex-shrink-0 p-3 text-white bg-dark" style={{ width: '250px', minHeight: '100vh' }}>
            <div className="text-center mb-4">
               <span className="fs-4">Viação Mimo</span>
            </div>
            <hr />
            <ul className="nav nav-pills flex-column mb-auto">
                {menus.map((menu) => {
                    // Lógica de Permissão (Igual ao PHP)
                    const temPermissao = role === 'admin' || permissoes.includes(menu.key);
                    
                    if (!temPermissao) return null;

                    const isActive = location.pathname === menu.link;
                    return (
                        <li className="nav-item" key={menu.key}>
                            <Link to={menu.link} className={`nav-link text-white ${isActive ? 'active' : ''}`}>
                                <i className={`bi ${menu.icon} me-2`}></i>
                                {menu.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <hr />
            <button onClick={handleLogout} className="btn btn-outline-danger w-100">
                <i className="bi bi-box-arrow-right me-2"></i> Sair
            </button>
        </div>
    );
};

export default Sidebar;
