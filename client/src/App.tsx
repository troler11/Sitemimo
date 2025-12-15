import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth'; 
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';
import RouteCreate from './pages/RouteCreate';

// Páginas
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import RotasPage from './pages/Rotas';
import AdminPage from './pages/Admin';
import EscalaPage from './pages/Escala';
import Relatorios from './pages/Relatorios';
import AcessoNegadoPage from './pages/AcessoNegadoPage';

// --- LAYOUT (Sidebar + Conteúdo) ---
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
            {/* CORREÇÃO: Passamos a propriedade toggle obrigatória */}
            <Sidebar 
                isOpen={isSidebarOpen} 
                toggle={() => setIsSidebarOpen(!isSidebarOpen)} 
            />
            
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
                        
                        <Route element={<AuthGuard requiredMenu="dashboard" />}>
                            <Route path="/" element={<DashboardPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="rotas" />}>
                            <Route path="/rotas" element={<RotasPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="escala" />}>
                            <Route path="/escala" element={<EscalaPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="relatorios" />}>
                            <Route path="/relatorios" element={<Relatorios />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="usuarios" />}>
                            <Route path="/admin/usuarios" element={<AdminPage />} />
                        </Route>
<Route path="/rotas/nova" element={<RouteCreate />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
