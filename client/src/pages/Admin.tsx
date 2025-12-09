import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Interfaces
interface User {
    id?: number;
    username: string;
    full_name: string;
    role: string;
    allowed_companies: string[];
    allowed_menus: string[];
    password?: string;
}

const LISTA_EMPRESAS = ['AAM', "AD'ORO", 'B. BOSCH', 'BOLLHOFF', 'CPQ', 'DROGA RAIA', 'MERCADO LIVRE GRU I', 'RED BULL', 'USP']; // Adicione todas aqui
const SISTEMA_MENUS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'rotas', label: 'Rotas' },
    { key: 'escala', label: 'Escala' },
    { key: 'usuarios', label: 'Usuários' }
];

const Admin: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null); // Se null, é modo criação
    const [showModal, setShowModal] = useState(false);

    // Estado do formulário
    const [formData, setFormData] = useState<User>({
        username: '', full_name: '', role: 'user', allowed_companies: [], allowed_menus: [], password: ''
    });

    const token = localStorage.getItem('token');

    const fetchUsers = async () => {
        const res = await axios.get('http://localhost:3000/api/users', { headers: { Authorization: `Bearer ${token}` } });
        setUsers(res.data);
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const headers = { Authorization: `Bearer ${token}` };
            if (editingUser && editingUser.id) {
                await axios.put(`http://localhost:3000/api/users/${editingUser.id}`, formData, { headers });
            } else {
                await axios.post('http://localhost:3000/api/users', formData, { headers });
            }
            setShowModal(false);
            fetchUsers();
        } catch (err) { alert('Erro ao salvar'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Tem certeza?')) return;
        await axios.delete(`http://localhost:3000/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchUsers();
    };

    const openModal = (user?: User) => {
        if (user) {
            setEditingUser(user);
            setFormData({ ...user, password: '' }); // Limpa senha ao editar
        } else {
            setEditingUser(null);
            setFormData({ username: '', full_name: '', role: 'user', allowed_companies: [], allowed_menus: [], password: '' });
        }
        setShowModal(true);
    };

    // Helpers de Checkbox
    const toggleArrayItem = (field: 'allowed_companies' | 'allowed_menus', value: string) => {
        const current = formData[field];
        const updated = current.includes(value) ? current.filter(i => i !== value) : [...current, value];
        setFormData({ ...formData, [field]: updated });
    };

    return (
        <div className="container-fluid mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3>Gestão de Usuários</h3>
                <button className="btn btn-primary" onClick={() => openModal()}><i className="bi bi-person-plus"></i> Novo Usuário</button>
            </div>

            <div className="card border-0 shadow-sm">
                <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                        <tr>
                            <th>Nome</th>
                            <th>Usuário</th>
                            <th>Nível</th>
                            <th>Empresas</th>
                            <th className="text-end">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id}>
                                <td className="fw-bold">{u.full_name}</td>
                                <td>{u.username}</td>
                                <td><span className={`badge ${u.role === 'admin' ? 'bg-danger' : 'bg-info'}`}>{u.role}</span></td>
                                <td className="small text-muted">{u.allowed_companies?.length} empresas</td>
                                <td className="text-end">
                                    <button className="btn btn-sm btn-outline-primary me-2" onClick={() => openModal(u)}><i className="bi bi-pencil"></i></button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u.id!)}><i className="bi bi-trash"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Simplificado (Bootstrap Style) */}
            {showModal && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg">
                        <form className="modal-content" onSubmit={handleSave}>
                            <div className="modal-header">
                                <h5 className="modal-title">{editingUser ? 'Editar' : 'Novo'} Usuário</h5>
                                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                            </div>
                            <div className="modal-body">
                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label">Nome Completo</label>
                                        <input type="text" className="form-control" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Usuário (Login)</label>
                                        <input type="text" className="form-control" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Senha {editingUser && '(Deixe em branco para manter)'}</label>
                                        <input type="password" className="form-control" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Nível</label>
                                        <select className="form-select" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                            <option value="user">Usuário Comum</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>

                                    {/* Checkboxes de Empresas */}
                                    <div className="col-12 mt-3">
                                        <label className="fw-bold">Empresas Permitidas</label>
                                        <div className="card p-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                            {LISTA_EMPRESAS.map(emp => (
                                                <div className="form-check" key={emp}>
                                                    <input 
                                                        className="form-check-input" type="checkbox" 
                                                        checked={formData.allowed_companies.includes(emp)}
                                                        onChange={() => toggleArrayItem('allowed_companies', emp)}
                                                    />
                                                    <label className="form-check-label">{emp}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Checkboxes de Menus */}
                                    <div className="col-12 mt-2">
                                        <label className="fw-bold">Menus Permitidos</label>
                                        <div className="d-flex gap-3 flex-wrap">
                                            {SISTEMA_MENUS.map(m => (
                                                <div className="form-check" key={m.key}>
                                                    <input 
                                                        className="form-check-input" type="checkbox" 
                                                        checked={formData.allowed_menus.includes(m.key)}
                                                        onChange={() => toggleArrayItem('allowed_menus', m.key)}
                                                    />
                                                    <label className="form-check-label">{m.label}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
