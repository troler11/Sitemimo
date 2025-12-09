import React, { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

// 1. IMPORTANTE: Importar o CSS específico aqui
import './Login.css';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await api.post('/login', { username, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            navigate('/');
        } catch (err) {
            setError('Usuário ou senha incorretos.');
        }
    };

    return (
        // Wrapper do Fundo Degradê
        <div className="login-bg-wrapper">
            
            {/* Cartão Centralizado */}
            <div className="card-login-custom">
                
                {/* Header com Logo */}
                <div className="card-login-header">
                    <img 
                        src="https://viacaomimo.com.br/wp-content/uploads/2023/07/Logo.png" 
                        alt="Logo" 
                        className="logo-login" 
                    />
                    <h5 className="text-secondary mt-2">Acesso ao Sistema</h5>
                </div>
                
                <div className="card-body p-4">
                    {error && (
                        <div className="alert alert-danger d-flex align-items-center mb-3" role="alert">
                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                            <div>{error}</div>
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        {/* Usuário */}
                        <div className="mb-3">
                            <label htmlFor="username" className="login-label">USUÁRIO</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0">
                                    <i className="bi bi-person-fill text-secondary"></i>
                                </span>
                                <input 
                                    type="text" 
                                    className="form-control border-start-0 ps-0" 
                                    id="username" 
                                    placeholder="Seu usuário" 
                                    required 
                                    autoFocus
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Senha */}
                        <div className="mb-4">
                            <label htmlFor="password" className="login-label">SENHA</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0">
                                    <i className="bi bi-lock-fill text-secondary"></i>
                                </span>
                                <input 
                                    type="password" 
                                    className="form-control border-start-0 ps-0" 
                                    id="password" 
                                    placeholder="Sua senha" 
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Botão */}
                        <div className="d-grid">
                            <button type="submit" className="btn-login-custom">
                                Entrar
                            </button>
                        </div>
                    </form>
                </div>

                <div className="login-footer">
                    <small className="text-muted d-block">&copy; {new Date().getFullYear()} Viação Mimo</small>
                    <small className="text-muted">Desenvolvido por: Lucas Bueno</small>
                </div>
            </div>
        </div>
    );
};

export default Login;
