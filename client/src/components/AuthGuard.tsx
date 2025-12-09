import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth'; // Certifique-se de que o caminho está correto

interface AuthGuardProps {
    requiredMenu: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    // 1. Acessa o estado de autenticação global (incluindo o flag de inicialização)
    const { isLoggedIn, currentUser, isInitializing } = useAuth();

    // 2. VERIFICAÇÃO DE INICIALIZAÇÃO (CRÍTICO: Evita o loop de login / Condição de Corrida)
    // Se o sistema ainda estiver lendo o token do localStorage, mostra o spinner.
    if (isInitializing) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted">Carregando sessão...</p>
            </div>
        );
    }

    // 3. VERIFICAÇÃO DE AUTENTICAÇÃO (O usuário está logado?)
    if (!isLoggedIn) {
        // Redireciona para a tela de login se não estiver autenticado
        return <Navigate to="/login" replace />;
    }

    // 4. VERIFICAÇÃO DE AUTORIZAÇÃO (O usuário tem permissão para esta página/menu?)
    // Usamos o encadeamento opcional (?) e o includes para checar a permissão.
    // Se currentUser for nulo ou allowed_menus for nulo, a checagem falha.
    const hasPermission = currentUser?.allowed_menus.includes(requiredMenu);

    if (!hasPermission) {
        // Redireciona para a página de acesso negado
        return <Navigate to="/unauthorized" replace />;
    }

    // 5. AUTORIZADO: Renderiza o componente filho (a página protegida)
    return <Outlet />;
};

export default AuthGuard;
