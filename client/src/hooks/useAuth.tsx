import React, { useState, useEffect, useContext, createContext, useMemo } from 'react';

// --- Interfaces ---
interface UserData {
    username: string;
    full_name: string;
    role: string;
    allowed_menus: string[];
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

// --- AuthProvider ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<UserData | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    const login = (token: string, user: UserData) => {
        localStorage.setItem('authToken', token);
        localStorage.setItem('userData', JSON.stringify(user));
        setIsLoggedIn(true);
        setCurrentUser(user);
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        setIsLoggedIn(false);
        setCurrentUser(null);
    };

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const userDataString = localStorage.getItem('userData');
        
        if (token && userDataString) {
            try {
                const userData = JSON.parse(userDataString);
                setIsLoggedIn(true);
                setCurrentUser(userData);
            } catch (e) {
                console.error(e);
                logout();
            }
        }
        setIsInitializing(false);
    }, []);

    // OBSERVE AQUI: O fechamento correto do useMemo
    const contextValue = useMemo(() => ({
        isLoggedIn,
        currentUser,
        isInitializing,
        login,
        logout,
    }), [isLoggedIn, currentUser, isInitializing]); 

    // OBSERVE AQUI: A sintaxe exata do return
    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// --- Hook ---
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
