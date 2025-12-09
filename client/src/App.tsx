import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Login from './pages/Login';
import DashboardPage from './pages/Dashboard';
import RotasPage from './pages/Rotas';
import AdminPage from './pages/Admin';
import EscalaPage from './pages/Escala';
import Relatorios from './pages/Relatorios';
import Placeholder from './pages/Placeholder';
import Sidebar from './components/Sidebar';
import AcessoNegadoPage from './pages/AcessoNegadoPage'; // <-- ADICIONE ESTA LINHA

// Layout Global com Sidebar e Área de Conteúdo
// Exemplo Simulado de Páginas de Fallback
const LoginPage = () => <h1>Login</h1>;
const UnauthorizedPage = () => <h1>🚫 Acesso Não Autorizado</h1>;

const Layout = ({ children }: { children: React.ReactNode }) => {
    // Estado para controlar se a sidebar está aberta ou fechada
    // No PHP você usava localStorage 'mimo_menu_state', podemos manter a lógica se quiser
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    // Ajusta a margem do conteúdo baseado na sidebar (250px vs 80px)
    const contentStyle = {
        marginLeft: isSidebarOpen ? '250px' : '80px',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa' // Fundo cinza claro padrão
    };

    return (
        <div className="d-flex">
            <Sidebar isOpen={isSidebarOpen} />
            
            <div style={contentStyle} className="w-100">
                {/* Botão Flutuante ou no Header para abrir/fechar menu */}
                {/* Injetamos o toggle function nas páginas ou colocamos um header global aqui */}
                <div className="p-3">
                    {/* Botão Toggle Global (opcional, pode ficar dentro de cada página se preferir manter o layout exato do PHP) */}
                    {/* <button className="btn btn-outline-dark border-0 shadow-sm mb-3" onClick={toggleSidebar}>
                        <i className="bi bi-list fs-5"></i>
                    </button> 
                    */}
                    
                    {/* Passamos o toggle para os filhos caso eles queiram usar o botão no header deles */}
                    {React.Children.map(children, child => {
                        if (React.isValidElement(child)) {
                            // @ts-ignore
                            return React.cloneElement(child, { toggleSidebar });
                        }
                        return child;
                    })}
                </div>
            </div>
        </div>
    );
};

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
    const auth = localStorage.getItem('token');
    return auth ? <Layout>{children}</Layout> : <Navigate to="/login" />;
};

const App: React.FC = () => {
   return (
        <BrowserRouter>
            <Routes>
                {/* Rotas Públicas */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/unauthorized" element={<AcessoNegadoPage />} />
                
                {/* --- ROTAS PROTEGIDAS POR MENU --- */}
                
                {/* 1. Protegendo a página de Rotas (requiredMenu="rotas") */}
                <Route element={<AuthGuard requiredMenu="rotas" />}>
                    <Route path="/rotas" element={<RotasPage />} />
                </Route>

                {/* 2. Protegendo a página de Escala (requiredMenu="escala") */}
                <Route element={<AuthGuard requiredMenu="escala" />}>
                    <Route path="/escala" element={<EscalaPage />} />
                </Route>

                {/* 3. Protegendo o Painel de Usuários (requiredMenu="usuarios") */}
                <Route element={<AuthGuard requiredMenu="usuarios" />}>
                    <Route path="/admin/usuarios" element={<AdminPage />} />
                </Route>

                {/* 4. Protegendo o Dashboard (Acesso básico) */}
                {/* Embora o Dashboard seja comum, se for necessário ter permissão, você a define aqui: */}
                <Route element={<AuthGuard requiredMenu="dashboard" />}>
                    <Route path="/" element={<DashboardPage />} />
                </Route>

            </Routes>
        </BrowserRouter>
    );
};

export default App;
