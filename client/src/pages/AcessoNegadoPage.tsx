import React from 'react';
import { Link } from 'react-router-dom';

const AcessoNegadoPage: React.FC = () => {
    return (
        <div className="container mt-5 text-center">
            <div className="card shadow-lg p-5 mx-auto" style={{ maxWidth: '600px' }}>
                <i className="bi bi-shield-fill-exclamation text-danger display-1 mb-4"></i>
                <h1 className="text-danger mb-3">Acesso Negado (403)</h1>
                <p className="lead">
                    Lamentamos, mas você não possui permissão para visualizar este recurso.
                    Entre em contato com o administrador do sistema para solicitar acesso.
                </p>
                <hr />
                {/* O Link redireciona para a rota principal do Dashboard */}
                <Link to="/" className="btn btn-primary mt-3">
                    Voltar para o Dashboard Seguro
                </Link>
            </div>
        </div>
    );
};

export default AcessoNegadoPage;
