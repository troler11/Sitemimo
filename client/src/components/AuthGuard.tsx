import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface AuthGuardProps {
    // 1. Tornamos a prop opcional (adicionando o '?')
    requiredMenu?: string; 
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

    // 2. Não logado (Bloqueia quem não tem token)
    if (!isLoggedIn || !currentUser) {
        return <Navigate to="/login" replace />;
    }

    // 3. Se a rota não exige um menu específico, basta estar logado!
    if (!requiredMenu) {
        return <Outlet />;
    }

    // --- LÓGICA DE PERMISSÃO ---
    
    // Verifica se é Admin (Chave Mestra)
    const isAdmin = currentUser.role === 'admin';

    // 4. Blindagem contra falhas de tipo: Garante que os menus sejam um Array
    const menusPermitidos = Array.isArray(currentUser.allowed_menus) 
        ? currentUser.allowed_menus 
        : [];

    // 5. Regra de Ouro:
    const temPermissao = isAdmin || menusPermitidos.includes(requiredMenu);

    if (!temPermissao) {
        return <Navigate to="/unauthorized" replace />;
    }

    // Autorizado
    return <Outlet />;
};

export default AuthGuard;
