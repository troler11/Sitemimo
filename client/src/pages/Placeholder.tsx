import React from 'react';

const Placeholder: React.FC<{ title: string }> = ({ title }) => {
    return (
        <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
            <i className="bi bi-cone-striped fs-1 mb-3"></i>
            <h3>{title}</h3>
            <p>Módulo em desenvolvimento.</p>
        </div>
    );
};

export default Placeholder;
