import React, { useState, useEffect, useContext, createContext, useMemo } from 'react';

// --- 1. Interfaces de Dados e Contexto ---
interface UserData {
    username: string;
    full_name: string;
    role: string;
    allowed_menus: string[];
    // Adicione outros campos necessários
}

interface AuthContextType {
    isLoggedIn: boolean;
    currentUser: UserData | null;
    isInitializing: boolean; // Flag para prevenir a condição de corrida no AuthGuard
    login: (token: string, user: UserData) => void;
    logout: () => void;
}

// Valores iniciais antes da carga
const defaultAuthContext: AuthContextType = {
    isLoggedIn: false,
    currentUser: null,
    isInitializing: true,
    login: () => {},
    logout: () => {},
};

// Criação do Contexto
const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// --- 2. Provedor de Contexto (AuthProvider) ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<UserData | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    // Função para salvar token e dados do usuário
    const login = (token: string, user: UserData) => {
        localStorage.setItem('authToken', token);
        localStorage.setItem('userData', JSON.stringify(user));
        setIsLoggedIn(true);
        setCurrentUser(user);
    };

    // Função de logout
    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        setIsLoggedIn(false);
        setCurrentUser(null);
    };

    // EFEITO DE INICIALIZAÇÃO: Lógica para ler o storage e definir o flag isInitializing
    useEffect(() => {
      const token = localStorage.getItem('authToken');
        const userDataString = localStorage.getItem('userData');
        
       if (token && userDataString) {
            try {
               const userData = JSON.parse(userDataString);
                setIsLoggedIn(true);
                setCurrentUser(userData);
            } catch (e) {
               console.error("Erro ao parsear dados do usuário:", e);
                logout();
            }
        }
        
        // CRÍTICO: Define como false APÓS a leitura do storage, permitindo o AuthGuard agir.
     setIsInitializing(false);
    }, []);

    // Memoiza o valor do contexto
    const contextValue = useMemo(() => ({
        isLoggedIn,
        currentUser,
        isInitializing,
        login,
        logout,
    }), [isLoggedIn, currentUser, isInitializing]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// --- 3. Hook de Consumo (useAuth) ---
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
