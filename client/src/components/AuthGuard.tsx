import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface AuthGuardProps {
    requiredMenu: string; // Obrigatório passar o nome do menu
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    const { isLoggedIn, currentUser, isInitializing } = useAuth();

    // 1. Aguarda carregamento (Evita bugs de redirect)
    if (isInitializing) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted">Verificando permissões...</p>
            </div>
        );
    }

    // 2. Verifica Login
    if (!isLoggedIn || !currentUser) {
        return <Navigate to="/login" replace />;
    }

    // 3. Verifica Permissão Específica
    // Usa o operador ?. para evitar erro se o array for null/undefined
    const temPermissao = currentUser.allowed_menus?.includes(requiredMenu);

    if (!temPermissao) {
        console.warn(`Acesso negado. Usuário não tem o menu: ${requiredMenu}`);
        return <Navigate to="/unauthorized" replace />;
    }

    // 4. Autorizado
    return <Outlet />;
};

export default AuthGuard;
