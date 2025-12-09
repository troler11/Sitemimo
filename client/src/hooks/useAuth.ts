import React, { useState, useEffect, useContext, createContext } from 'react';

// --- Interfaces de Dados ---
interface UserData {
    username: string;
    full_name: string;
    role: string;
    allowed_menus: string[];
    // Adicione outros campos necessários aqui
}

interface AuthContextType {
    isLoggedIn: boolean;
    currentUser: UserData | null;
    isInitializing: boolean; // 🛑 CRÍTICO: Flag que indica se o app terminou de ler o token do storage
    login: (token: string, user: UserData) => void;
    logout: () => void;
    // ... outras funções de autenticação
}

// Valores iniciais antes da carga
const defaultAuthContext: AuthContextType = {
    isLoggedIn: false,
    currentUser: null,
    isInitializing: true,
    login: () => {},
    logout: () => {},
};

// 1. Criação do Contexto
const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// 2. Provedor de Contexto
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

    // 3. EFEITO DE INICIALIZAÇÃO (Resolve o Loop de Login)
    useEffect(() => {
        console.log("Iniciando verificação de sessão...");
        const token = localStorage.getItem('authToken');
        const userDataString = localStorage.getItem('userData');
        
        if (token && userDataString) {
            try {
                const userData = JSON.parse(userDataString);
                // Duração do Token e Validação poderiam ser verificadas aqui
                setIsLoggedIn(true);
                setCurrentUser(userData);
            } catch (e) {
                console.error("Erro ao parsear dados do usuário:", e);
                logout(); // Limpa dados corrompidos
            }
        }
        
        // 🛑 ESTE É O PASSO MAIS IMPORTANTE: Muda o flag DEPOIS da checagem.
        // O AuthGuard aguarda este estado ser false antes de tomar decisões de redirecionamento.
        setIsInitializing(false); 
        console.log("Sessão verificada. isInitializing: false");
    }, []);

    const contextValue = {
        isLoggedIn,
        currentUser,
        isInitializing,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// 4. Hook de Consumo
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
