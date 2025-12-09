// src/components/AuthGuard.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthGuard: React.FC = () => {
    const { isLoggedIn, isInitializing } = useAuth();

    // 1. ESPERA A LEITURA DO LOCALSTORAGE (Crucial)
    if (isInitializing) {
        return <div className="p-5 text-center">Carregando...</div>;
    }

    // 2. SE NÃO ESTIVER LOGADO, MANDA PRO LOGIN
    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    // 3. LIBERA O ACESSO
    return <Outlet />;
};

export default AuthGuard;
