import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface AuthGuardProps {
    requiredMenu: string;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ requiredMenu }) => {
    const { isLoggedIn, currentUser, isInitializing } = useAuth();

    // 1. Carregando (Evita tela branca ou redirect errado enquanto lê o token)
    if (isInitializing) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 flex-column">
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted">Verificando permissões...</p>
            </div>
        );
    }

    // 2. Não logado (Redireciona para login)
    if (!isLoggedIn || !currentUser) {
        return <Navigate to="/login" replace />;
    }

    // --- LÓGICA DE PERMISSÃO ---
    
    // 3. Verifica se é Admin (Chave Mestra)
    // Certifique-se que no banco de dados o role esteja escrito exatamente 'admin'
    const isAdmin = currentUser.role === 'admin';

    // 4. Regra de Ouro:
    // Passa se for Admin OU se tiver o menu específico na lista
    const temPermissao = isAdmin || currentUser.allowed_menus?.includes(requiredMenu);

    if (!temPermissao) {
        // Se não for admin E não tiver o menu, bloqueia
        return <Navigate to="/unauthorized" replace />;
    }

    // 5. Autorizado
    return <Outlet />;
};

export default AuthGuard;
