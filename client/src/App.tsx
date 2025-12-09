import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sidebar from './components/Sidebar';
import Placeholder from './pages/Placeholder';

// Componente Layout para Sidebar
const Layout = ({ children }: { children: React.ReactNode }) => (
    <div className="d-flex">
        <Sidebar />
        <div className="content w-100 p-3">
            {children}
        </div>
    </div>
);

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
    const auth = localStorage.getItem('token');
    return auth ? <Layout>{children}</Layout> : <Navigate to="/login" />;
};

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={
                    <PrivateRoute>
                        <Dashboard />
                    </PrivateRoute>
                } />
                {/* Adicionar rotas para Admin, Escala, etc */}
                <Route path="/rotas" element={<PrivateRoute><Placeholder title="Gestão de Rotas" /></PrivateRoute>} />
<Route path="/veiculos" element={<PrivateRoute><Placeholder title="Gestão de Veículos" /></PrivateRoute>} />
            </Routes>
        </Router>
    );
};

export default App;
