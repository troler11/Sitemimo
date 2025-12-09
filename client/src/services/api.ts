import axios from 'axios';

// URL base da API
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const api = axios.create({
    baseURL: isLocal ? 'http://localhost:3000/api' : '/api',
});

// --- CORREÇÃO AQUI ---
api.interceptors.request.use((config) => {
    // TEM QUE SER 'authToken' (igual ao que está no useAuth.tsx)
    const token = localStorage.getItem('authToken'); 
    
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Interceptador de Resposta
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Limpa com os nomes corretos definidos no useAuth
            localStorage.removeItem('authToken'); // Era 'token'
            localStorage.removeItem('userData');  // Era 'user'
            
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
