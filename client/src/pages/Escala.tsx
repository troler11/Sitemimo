import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Escala: React.FC = () => {
    const [dados, setDados] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroData, setFiltroData] = useState(new Date().toLocaleDateString('pt-BR'));

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:3000/api/escala', {
                params: { data: filtroData },
                headers: { Authorization: `Bearer ${token}` }
            });
            // Se precisar processar o array bruto aqui (igual o PHP fazia), faça antes do setDados
            setDados(res.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [filtroData]);

    return (
        <div className="container-fluid mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3>Escala de Frota</h3>
                <div className="d-flex gap-2">
                    <input 
                        type="text" className="form-control" 
                        placeholder="dd/mm/aaaa" 
                        value={filtroData} 
                        onChange={e => setFiltroData(e.target.value)} 
                    />
                    <button className="btn btn-dark" onClick={fetchData}><i className="bi bi-arrow-clockwise"></i></button>
                </div>
            </div>

            {/* KPIs Rápidos (Exemplo) */}
            <div className="row g-3 mb-4">
                <div className="col-md-3"><div className="card p-3 bg-primary text-white"><h5>Total</h5><h3>{dados.length}</h3></div></div>
                {/* Adicione outros KPIs baseados no state 'dados' */}
            </div>

            <div className="table-responsive bg-white shadow-sm rounded">
                <table className="table table-hover mb-0">
                    <thead className="table-light">
                        <tr>
                            <th>Empresa</th>
                            <th>Rota</th>
                            <th>Veículo</th>
                            <th>Motorista</th>
                            <th>H. Prog</th>
                            <th>H. Real</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={7} className="text-center p-4">Carregando...</td></tr> : 
                        dados.map((row, i) => (
                            <tr key={i}>
                                {/* Ajuste as chaves conforme o JSON que volta do Google */}
                                <td>{row.empresa || row[0]}</td>
                                <td>{row.rota || row[1]}</td>
                                <td className="fw-bold">{row.frota_escala || row[4]}</td>
                                <td>{row.motorista || row[2]}</td>
                                <td>{row.h_prog || row[6]}</td>
                                <td>{row.h_real || row[7]}</td>
                                <td>
                                    {/* Exemplo de lógica visual */}
                                    {row.manutencao ? <span className="badge bg-danger">Manutenção</span> : 
                                     <span className="badge bg-success">Confirmado</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
export default Escala;
