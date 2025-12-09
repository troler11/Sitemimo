import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth'; 
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';

// Páginas
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import RotasPage from './pages/Rotas';
import AdminPage from './pages/Admin';
import EscalaPage from './pages/Escala';
import AcessoNegadoPage from './pages/AcessoNegadoPage';

// Layout (Sidebar + Conteúdo)
const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const contentStyle = {
        marginLeft: isSidebarOpen ? '250px' : '80px',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa'
    };

    return (
        <div className="d-flex">
            <Sidebar isOpen={isSidebarOpen} />
            <div style={contentStyle} className="w-100">
                <div className="p-3">
                    <Outlet context={{ toggleSidebar: () => setIsSidebarOpen(!isSidebarOpen) }} />
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* --- ROTAS PÚBLICAS --- */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/unauthorized" element={<AcessoNegadoPage />} />
                    
                    {/* --- ROTAS PROTEGIDAS (Com Layout) --- */}
                    <Route element={<Layout />}>
                        
                        {/* 1. Dashboard */}
                        <Route element={<AuthGuard requiredMenu="dashboard" />}>
                            <Route path="/" element={<DashboardPage />} />
                        </Route>

                        {/* 2. Rotas */}
                        <Route element={<AuthGuard requiredMenu="rotas" />}>
                            <Route path="/rotas" element={<RotasPage />} />
                        </Route>

                        {/* 3. Escala */}
                        <Route element={<AuthGuard requiredMenu="escala" />}>
                            <Route path="/escala" element={<EscalaPage />} />
                        </Route>

                        {/* 4. Usuários (Admin) */}
                        <Route element={<AuthGuard requiredMenu="usuarios" />}>
                            <Route path="/admin/usuarios" element={<AdminPage />} />
                        </Route>

                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
