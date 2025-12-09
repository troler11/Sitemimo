import React, { useState, useEffect, useContext, createContext, useMemo } from 'react';

// --- 1. Interfaces ---
interface UserData {
    username: string;
    full_name: string;
    role: string;
    allowed_companies: string[];
    // O backend pode mandar 'menus' ou 'allowed_menus', aceitamos os dois
    allowed_menus?: string[]; 
    menus?: string[];         
}

interface AuthContextType {
    isLoggedIn: boolean;
    currentUser: UserData | null;
    isInitializing: boolean; 
    login: (token: string, user: UserData) => void;
    logout: () => void;
}

// Valores padrão
const defaultAuthContext: AuthContextType = {
    isLoggedIn: false,
    currentUser: null,
    isInitializing: true,
    login: () => {},
    logout: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// --- 2. Provedor (AuthProvider) ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<UserData | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    // --- FUNÇÃO DE LOGIN COM ADAPTADOR ---
    const login = (token: string, user: UserData) => {
        
        // A MÁGICA ACONTECE AQUI:
        // Normaliza os dados para garantir que 'allowed_menus' sempre exista
        const userNormalizado = {
            ...user,
            allowed_menus: user.allowed_menus || user.menus || [] 
        };

        // Salva no navegador
        localStorage.setItem('authToken', token);
        localStorage.setItem('userData', JSON.stringify(userNormalizado));
        
        // Atualiza o estado da aplicação
        setIsLoggedIn(true);
        setCurrentUser(userNormalizado);
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        setIsLoggedIn(false);
        setCurrentUser(null);
    };

    // --- EFEITO DE INICIALIZAÇÃO (Carrega ao abrir o site) ---
    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const userDataString = localStorage.getItem('userData');
        
        if (token && userDataString) {
            try {
                const userData = JSON.parse(userDataString);
                setIsLoggedIn(true);
                setCurrentUser(userData);
            } catch (e) {
                console.error("Erro ao restaurar sessão:", e);
                logout();
            }
        }
        
        // Finaliza o carregamento
        setIsInitializing(false); 
    }, []);

    // Memoiza o valor para performance
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

// --- 3. Hook para usar em outros arquivos ---
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
