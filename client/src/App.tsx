import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth'; // Contexto é obrigatório
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';

// Páginas
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import RotasPage from './pages/Rotas';
import AdminPage from './pages/Admin';
import EscalaPage from './pages/Escala';
// import Relatorios from './pages/Relatorios';
import AcessoNegadoPage from './pages/AcessoNegadoPage';

// --- 1. LAYOUT ATUALIZADO (Usando Outlet) ---
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
                    {/* Outlet renderiza a página filha da rota atual (Dashboard, Rotas, etc) */}
                    <Outlet context={{ toggleSidebar: () => setIsSidebarOpen(!isSidebarOpen) }} />
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return (
        // 2. IMPORTANTE: O AuthProvider deve envolver TUDO
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* --- ROTAS PÚBLICAS (Sem Sidebar) --- */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/unauthorized" element={<AcessoNegadoPage />} />
                    
                    {/* --- ROTAS PRIVADAS (Com Sidebar) --- */}
                    
                    {/* O Layout envolve todas as rotas abaixo */}
                    <Route element={<Layout />}>
                        
                        {/* AQUI APLICAMOS AS REGRAS DE SEGURANÇA (AuthGuard) */}
                        
                        {/* OBS: Se você removeu a lógica de 'requiredMenu' no passo anterior, 
                            remova a prop requiredMenu="..." abaixo e deixe apenas <Route element={<AuthGuard />}> */}

                        <Route element={<AuthGuard requiredMenu="rotas" />}>
                            <Route path="/rotas" element={<RotasPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="escala" />}>
                            <Route path="/escala" element={<EscalaPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="usuarios" />}>
                            <Route path="/admin/usuarios" element={<AdminPage />} />
                        </Route>

                        {/* Dashboard (Permissão básica ou específica) */}
                        <Route element={<AuthGuard requiredMenu="dashboard" />}>
                            <Route path="/" element={<DashboardPage />} />
                        </Route>

                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
