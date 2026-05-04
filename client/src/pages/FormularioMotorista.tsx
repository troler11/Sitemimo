import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Search, Plus, Download, Trash2, Edit2, ArrowLeft, RotateCcw } from 'lucide-react';

interface Motorista {
  id?: string | number;
  nome: string;
  chapa: string;
  telefone: string;
  cpf: string;
}

const GestaoMotoristas = () => {
  const { user } = useAuth(); // Hook de autenticação
  const navigate = useNavigate();
  
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Motorista>({ nome: '', chapa: '', telefone: '', cpf: '' });
  const [editandoId, setEditandoId] = useState<string | number | null>(null);

  useEffect(() => {
    carregarMotoristas();
  }, []);

  const carregarMotoristas = async () => {
    try {
      const response = await api.get('/motoristas');
      setMotoristas(response.data);
    } catch (err) {
      console.error("Erro ao carregar dados", err);
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editandoId) {
        await api.put(`/motoristas/${editandoId}`, formData);
      } else {
        await api.post('/motoristas', formData);
      }
      setShowForm(false);
      setEditandoId(null);
      setFormData({ nome: '', chapa: '', telefone: '', cpf: '' });
      carregarMotoristas();
    } catch (err) {
      alert("Erro ao salvar dados do motorista.");
    }
  };

  const handleExcluir = async (id: string | number) => {
    if (window.confirm("Deseja realmente excluir este motorista?")) {
      try {
        await api.delete(`/motoristas/${id}`);
        carregarMotoristas();
      } catch (err) {
        alert("Erro ao excluir.");
      }
    }
  };

  const prepararEdicao = (m: Motorista) => {
    setFormData(m);
    setEditandoId(m.id!);
    setShowForm(true);
  };

  const colors = {
    bg: '#f3f4f6',
    white: '#ffffff',
    primary: '#00a86b',
    textGray: '#6b7280',
    textDark: '#111827',
    border: '#e5e7eb'
  };

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ border: '1px solid #ccc', background: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
             <ArrowLeft size={18} /> Voltar
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>Gestão de Motoristas</h1>
            <span style={{ fontSize: '12px', color: colors.textGray, textTransform: 'uppercase' }}>Controle de Efetivo</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
           <button onClick={carregarMotoristas} style={{ background: 'white', border: `1px solid ${colors.border}`, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
             <RotateCcw size={18} />
           </button>
           <div style={{ background: colors.primary, color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}>
             Usuário: {user?.nome || 'Operador'}
           </div>
        </div>
      </div>

      {/* LISTAGEM */}
      <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: '14px', color: colors.primary, fontWeight: 'bold', textTransform: 'uppercase' }}>Listagem de Colaboradores</h3>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: colors.textGray }} />
              <input 
                type="text" 
                placeholder="Pesquisar por nome..." 
                style={{ padding: '8px 12px 8px 35px', borderRadius: '8px', border: `1px solid ${colors.border}`, width: '250px' }}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button 
              onClick={() => { setShowForm(true); setEditandoId(null); setFormData({nome:'', chapa:'', telefone:'', cpf:''}) }}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: colors.primary, color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
            >
              <Plus size={18} /> Novo
            </button>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {['NOME COMPLETO', 'REGISTRO', 'TELEFONE', 'CPF', 'AÇÕES'].map((header) => (
                <th key={header} style={{ padding: '15px 20px', fontSize: '11px', color: colors.textGray, fontWeight: 600 }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {motoristas.filter(m => m.nome.toLowerCase().includes(busca.toLowerCase())).map((m) => (
              <tr key={m.id} style={{ borderBottom: `1px solid #f9fafb` }}>
                <td style={{ padding: '15px 20px', fontSize: '13px', fontWeight: 'bold', color: colors.textDark }}>{m.nome}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.chapa}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.telefone}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.cpf}</td>
                <td style={{ padding: '15px 20px', display: 'flex', gap: '15px' }}>
                  <Edit2 size={16} onClick={() => prepararEdicao(m)} style={{ cursor: 'pointer', color: colors.textGray }} />
                  <Trash2 size={16} onClick={() => handleExcluir(m.id!)} style={{ cursor: 'pointer', color: '#ef4444' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar Motorista' : 'Novo Motorista'}</h3>
            <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textGray }}>NOME COMPLETO</label>
                <input style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value.toUpperCase()})} required />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textGray }}>REGISTRO</label>
                  <input style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} value={formData.chapa} onChange={e => setFormData({...formData, chapa: e.target.value})} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textGray }}>CPF (SÓ NÚMEROS)</label>
                  <input style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} required maxLength={11} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textGray }}>TELEFONE</label>
                <input style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: colors.primary, color: 'white', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Salvar</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, background: '#eee', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoMotoristas;
