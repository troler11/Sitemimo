import React, { useState } from 'react';
// 1. IMPORTANTE: Não importe 'axios' direto. Importe nossa instância 'api'
import api from '../services/api'; 
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // 2. IMPORTANTE: Use 'api.post' e coloque apenas o final da rota ('/login')
            // O arquivo api.ts já sabe que deve adicionar '/api' antes.
            const res = await api.post('/login', { username, password });
            
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            
            navigate('/');
        } catch (err) {
            setError('Usuário ou senha incorretos');
        }
    };

    return (
        <div className="d-flex align-items-center justify-content-center vh-100 bg-dark">
            <div className="card p-4 shadow-lg" style={{ width: '400px' }}>
                <div className="text-center mb-4">
                    <img src="https://viacaomimo.com.br/wp-content/uploads/2023/07/Logo.png" alt="Logo" width="150" />
                    <h5 className="mt-3 text-secondary">Acesso ao Sistema</h5>
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
                <form onSubmit={handleLogin}>
                    <div className="mb-3">
                        <label className="form-label">Usuário</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            value={username} 
                            onChange={e => setUsername(e.target.value)} 
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label">Senha</label>
                        <input 
                            type="password" 
                            className="form-control" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                        />
                    </div>
                    <button type="submit" className="btn btn-primary w-100">Entrar</button>
                </form>
            </div>
        </div>
    );
};

export default Login;
