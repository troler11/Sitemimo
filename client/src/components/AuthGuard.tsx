// src/components/AuthGuard.tsx

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth'; // Use seu hook real



interface AuthGuardProps {
    requiredMenu: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    const { isLoggedIn, currentUser, isInitializing } = useAuth(); // Use seu hook real

    // 🛑 1. TRATAMENTO DE INICIALIZAÇÃO: Bloqueia o redirecionamento até que o estado seja lido
    if (isInitializing) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted">Carregando sessão...</p>
            </div>
        );
    }
    
    // 2. VERIFICAÇÃO DE AUTENTICAÇÃO
    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    // 3. VERIFICAÇÃO DE AUTORIZAÇÃO
    const hasPermission = currentUser?.allowed_menus.includes(requiredMenu);

    if (!hasPermission) {
        return <Navigate to="/unauthorized" replace />;
    }

    return <Outlet />; 
};

export default AuthGuard;
