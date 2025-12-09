import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface AuthGuardProps {
    requiredMenu: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    const { isLoggedIn, currentUser, isInitializing } = useAuth();

    // 1. Carregando
    if (isInitializing) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted">Verificando permissões...</p>
            </div>
        );
    }

    // 2. Não logado
    if (!isLoggedIn || !currentUser) {
        return <Navigate to="/login" replace />;
    }

    // --- NOVA LÓGICA DE ADMIN ---
    
    // Verifica se é admin (baseado na interface UserData que definimos no useAuth)
    const isAdmin = currentUser.role === 'admin';

    // A pessoa passa se for Admin OU se tiver o menu específico na lista
    const temPermissao = isAdmin || currentUser.allowed_menus?.includes(requiredMenu);

    if (!temPermissao) {
        return <Navigate to="/unauthorized" replace />;
    }

    return <Outlet />;
};

export default AuthGuard;
