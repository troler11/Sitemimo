import React, { useState, useEffect, useContext, createContext, useMemo } from 'react';

// --- 1. Interface (O formato ideal que o App usa) ---
interface UserData {
    username: string;
    full_name: string;
    role: string;
    allowed_companies: string[];
    allowed_menus: string[];
    menus?: string[]; // Mantemos opcional para compatibilidade
}

interface AuthContextType {
    isLoggedIn: boolean;
    currentUser: UserData | null;
    isInitializing: boolean;
    login: (token: string, backendUser: any) => void; // Aceita 'any' para tratar o que vier
    logout: () => void;
}

const defaultAuthContext: AuthContextType = {
    isLoggedIn: false,
    currentUser: null,
    isInitializing: true,
    login: () => {},
    logout: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// --- 2. Provedor ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<UserData | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    // --- LOGIN COM ADAPTADOR DE DADOS ---
    const login = (token: string, backendUser: any) => {
        
        console.log("Recebido do Backend:", backendUser); // Debug

        // Aqui nós "traduzimos" o que o backend manda para o que o React entende
        const userNormalizado: UserData = {
            // 1. Username: Se não vier, usamos o 'name' ou 'admin' como fallback
            username: backendUser.username || backendUser.name || 'Usuario',
            
            // 2. Nome Completo: O backend manda 'name', nós queremos 'full_name'
            full_name: backendUser.full_name || backendUser.name || 'Sem Nome',
            
            // 3. Role: Esse geralmente vem certo
            role: backendUser.role || 'user',

            // 4. Empresas: Se não vier, garante array vazio
            allowed_companies: backendUser.allowed_companies || [],

            // 5. Menus: O backend manda 'menus', nós copiamos para 'allowed_menus'
            allowed_menus: backendUser.allowed_menus || backendUser.menus || [],
            menus: backendUser.menus || []
        };

        console.log("Usuário Normalizado (Salvo):", userNormalizado); // Debug

        localStorage.setItem('authToken', token);
        localStorage.setItem('userData', JSON.stringify(userNormalizado));
        
        setIsLoggedIn(true);
        setCurrentUser(userNormalizado);
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        setIsLoggedIn(false);
        setCurrentUser(null);
    };

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const userDataString = localStorage.getItem('userData');
        
        if (token && userDataString) {
            try {
                const userData = JSON.parse(userDataString);
                // Verifica se os dados salvos são válidos
                if (userData && userData.role) {
                    setIsLoggedIn(true);
                    setCurrentUser(userData);
                } else {
                    // Dados corrompidos no storage
                    logout();
                }
            } catch (e) {
                console.error("Erro ao ler dados:", e);
                logout();
            }
        }
        setIsInitializing(false);
    }, []);

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

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
