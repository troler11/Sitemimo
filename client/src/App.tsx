import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Escala from './pages/Escala';
import Relatorios from './pages/Relatorios';
import Placeholder from './pages/Placeholder';
import Sidebar from './components/Sidebar';

// Layout Global com Sidebar e Área de Conteúdo
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

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                
                <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/escala" element={<PrivateRoute><Escala /></PrivateRoute>} />
                <Route path="/relatorios" element={<PrivateRoute><Relatorios /></PrivateRoute>} />
                <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
                
                <Route path="/rotas" element={<PrivateRoute><Placeholder title="Rotas" /></PrivateRoute>} />
                <Route path="/veiculos" element={<PrivateRoute><Placeholder title="Veículos" /></PrivateRoute>} />
                <Route path="/motoristas" element={<PrivateRoute><Placeholder title="Motoristas" /></PrivateRoute>} />
            </Routes>
        </Router>
    );
};

export default App;
