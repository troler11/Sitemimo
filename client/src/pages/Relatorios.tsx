import React, { useRef } from 'react';

const Relatorios: React.FC = () => {
    const iframeContainerRef = useRef<HTMLDivElement>(null);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            iframeContainerRef.current?.requestFullscreen().catch(err => {
                console.error(`Erro ao ativar tela cheia: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    };

    return (
        <div className="container-fluid h-100 d-flex flex-column">
            <div className="d-flex justify-content-between align-items-center mb-3 mt-3">
                <div>
                    <h4 className="fw-bold mb-0">Indicadores</h4>
                    <small className="text-muted">Visualização Power BI</small>
                </div>
                <button className="btn btn-outline-secondary" onClick={toggleFullScreen}>
                    <i className="bi bi-arrows-fullscreen me-2"></i> Tela Cheia
                </button>
            </div>

            {/* Container que ficará em tela cheia */}
            <div 
                ref={iframeContainerRef} 
                className="flex-grow-1 bg-white rounded shadow-sm position-relative" 
                style={{ minHeight: '80vh', overflow: 'hidden' }}
            >
                <iframe 
                    title="Dashboard Viação Mimo" 
                    width="100%" 
                    height="100%" 
                    src="https://app.powerbi.com/view?r=eyJrIjoiMTA0YjQwNDUtNTBmYy00ZGVmLThhYzAtYzQ0ZTQyYmQ4ODY4IiwidCI6IjdlNDE1NmFiLWI3ZTgtNDZlMC1hOWNiLWE0MDgzYTRmNjdmNSJ9" 
                    frameBorder="0" 
                    allowFullScreen={true}
                    style={{ position: 'absolute', top: 0, left: 0 }}
                ></iframe>
            </div>
        </div>
    );
};

export default Relatorios;
