import axios from 'axios';

// URL base da API (pode vir de variáveis de ambiente depois)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const api = axios.create({
    baseURL: isLocal ? 'http://localhost:3000/api' : '/api',
});

// Interceptador de Requisição (Anexa o Token automaticamente)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Interceptador de Resposta (Trata erro 401 - Token Expirado)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Se der erro de autenticação, limpa tudo e joga pro login
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // Força redirecionamento (o window.location é mais garantido que o navigate aqui fora de componente)
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
