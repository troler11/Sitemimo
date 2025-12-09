import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css'; // Seus estilos globais
import 'bootstrap/dist/css/bootstrap.min.css'; // Bootstrap JS
import 'bootstrap-icons/font/bootstrap-icons.css'; // Ícones

const container = document.getElementById('root');
const root = createRoot(container!); // O ponto de exclamação diz ao TS que o elemento existe
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
