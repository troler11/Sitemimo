import React, { useState } from 'react';
// Adicionamos o 'Navigate' aqui na importação
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth'; 
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';
import RoutesList from './pages/RoutesList';
import RouteCreate from './pages/RouteCreate';

// Páginas
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import RotasPage from './pages/Rotas'; // <-- Caso esteja usando no RoutesList, se não, pode remover
import AdminPage from './pages/Admin';
import MotoristaPage from './pages/FormularioMotorista';
import EscalaPage from './pages/Escala';
import AtrasosPage from './pages/RelatorioAtrasos';
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

                        {/* CORREÇÃO: As sub-rotas de criação/edição agora estão protegidas! */}
                        <Route element={<AuthGuard requiredMenu="rotas" />}>
                            <Route path="/rotas" element={<RoutesList />} />
                            <Route path="/rotas/nova" element={<RouteCreate />} />
                            <Route path="/rotas/editar/:id" element={<RouteCreate />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="escala" />}>
                            <Route path="/escala" element={<EscalaPage />} />
                        </Route>

                       <Route element={<AuthGuard requiredMenu="atrasos" />}>
                            <Route path="/atrasos" element={<AtrasosPage />} />
                        </Route>
                        
                         <Route element={<AuthGuard requiredMenu="motoristas" />}>
                            <Route path="/motorista" element={<MotoristaPage />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="relatorios" />}>
                            <Route path="/relatorios" element={<Relatorios />} />
                        </Route>

                        <Route element={<AuthGuard requiredMenu="usuarios" />}>
                            <Route path="/admin/usuarios" element={<AdminPage />} />
                        </Route>
                        
                    </Route>

                    {/* CORREÇÃO: Redireciona qualquer URL digitada errada para o Dashboard */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
