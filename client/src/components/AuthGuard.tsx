// src/components/AuthGuard.tsx

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

// DICA: Substitua o 'useMockAuth' pelo seu hook real (ex: useAuth)
const useMockAuth = () => {
    // Supondo que você armazena o usuário logado globalmente
    // Exemplo de usuário logado (simulando permissão para dashboard e rotas):
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    
    return {
        isLoggedIn: !!user,
        currentUser: user || { allowed_menus: [] } 
    };
};

interface AuthGuardProps {
    requiredMenu: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    const { isLoggedIn, currentUser } = useMockAuth();

    // 1. VERIFICAÇÃO DE AUTENTICAÇÃO (O usuário está logado?)
    if (!isLoggedIn) {
        // Redireciona para a tela de login se não estiver logado
        return <Navigate to="/login" replace />;
    }

    // 2. VERIFICAÇÃO DE AUTORIZAÇÃO (O usuário tem a permissão necessária?)
    const hasPermission = currentUser.allowed_menus.includes(requiredMenu);

    if (!hasPermission) {
        // Redireciona para uma tela de acesso negado
        // OU para o Dashboard, se for a rota mais segura.
        console.warn(`Acesso negado: Usuário não possui permissão para '${requiredMenu}'`);
        return <Navigate to="/unauthorized" replace />;
    }

    // Se autorizado, renderiza o componente filho da rota (a página protegida)
    return <Outlet />; 
};

export default AuthGuard;
