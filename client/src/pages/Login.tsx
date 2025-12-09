import React, { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); // Limpa erro anterior
        
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
        <div className="login-wrapper">
            <div className="card card-login">
                <div className="card-header">
                    <img 
                        src="https://viacaomimo.com.br/wp-content/uploads/2023/07/Logo.png" 
                        alt="Logo" 
                        className="logo-img" 
                    />
                    <h5 className="text-secondary mt-2">Acesso ao Sistema</h5>
                </div>
                
                <div className="card-body p-4">
                    {error && (
                        <div className="alert alert-danger d-flex align-items-center" role="alert">
                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                            <div className="ms-2">{error}</div>
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        {/* Campo Usuário */}
                        <div className="mb-3">
                            <label htmlFor="username" className="form-label fw-bold text-secondary small">USUÁRIO</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light">
                                    <i className="bi bi-person-fill text-secondary"></i>
                                </span>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    id="username" 
                                    placeholder="Seu usuário" 
                                    required 
                                    autoFocus
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Campo Senha */}
                        <div className="mb-4">
                            <label htmlFor="password" className="form-label fw-bold text-secondary small">SENHA</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light">
                                    <i className="bi bi-lock-fill text-secondary"></i>
                                </span>
                                <input 
                                    type="password" 
                                    className="form-control" 
                                    id="password" 
                                    placeholder="Sua senha" 
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Botão Entrar */}
                        <div className="d-grid">
                            <button type="submit" className="btn btn-primary btn-login text-uppercase">
                                Entrar
                            </button>
                        </div>
                    </form>
                </div>

                <div className="card-footer text-center py-3 bg-light">
                    <small className="text-muted">&copy; {new Date().getFullYear()} Viação Mimo</small><br />
                    <small className="text-muted">Desenvolvido por: Lucas Bueno</small>
                </div>
            </div>
        </div>
    );
};

export default Login;
