import React, { useState, useEffect } from 'react';
import { Search, Plus, Download, Trash2, Edit2, ArrowLeft, RotateCcw } from 'lucide-react'; // Ícones úteis

interface Motorista {
  id?: string | number;
  nome: string;
  chapa: string; // "Registro" na imagem
  telefone: string;
  cpf: string;
}

const GestaoMotoristas = () => {
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Motorista>({ nome: '', chapa: '', telefone: '', cpf: '' });
  const [editandoId, setEditandoId] = useState<string | number | null>(null);

  // Simulação de carregamento (conectar com seu GET /api/motoristas)
  useEffect(() => {
    // Aqui você chamaria carregarMotoristas();
    setMotoristas([
      { id: 1, nome: 'GILBERTO', chapa: '1', telefone: '(11) 99999-0001', cpf: '123.456.789-01' },
      { id: 100, nome: 'GILMARA SANTOS', chapa: '100', telefone: '(11) 99999-0100', cpf: '987.654.321-00' },
      { id: 1009, nome: 'RODRIGO', chapa: '1009', telefone: '(11) 99999-1009', cpf: '456.789.123-55' },
    ]);
  }, []);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Lógica de POST/PUT aqui...
    setShowForm(false);
    setEditandoId(null);
    setFormData({ nome: '', chapa: '', telefone: '', cpf: '' });
  };

  const prepararEdicao = (m: Motorista) => {
    setFormData(m);
    setEditandoId(m.id!);
    setShowForm(true);
  };

  // --- Estilos Baseados na Imagem ---
  const colors = {
    bg: '#f3f4f6',
    white: '#ffffff',
    primary: '#00a86b', // Verde da imagem
    textGray: '#6b7280',
    textDark: '#111827',
    border: '#e5e7eb'
  };

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* HEADER SUPERIOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button style={{ border: '1px solid #ccc', background: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <ArrowLeft size={18} /> Voltar
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>Gestão de Motoristas</h1>
            <span style={{ fontSize: '12px', color: colors.textGray, textTransform: 'uppercase' }}>Controle de Efetivo e Categorias</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
           <button style={{ background: 'white', border: `1px solid ${colors.border}`, padding: '10px', borderRadius: '8px' }}><RotateCcw size={18} /></button>
           <button style={{ background: colors.primary, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Salvar Alterações</button>
        </div>
      </div>

      {/* CARDS DE RESUMO (Opcional, igual à imagem) */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
        {['GERAL', 'CATEGORIA B', 'MICRO ÔNIBUS'].map((label, i) => (
          <div key={i} style={{ background: 'white', padding: '15px 20px', borderRadius: '12px', flex: 1, border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: colors.textGray }}>{label}</span>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}>{i === 0 ? motoristas.length : '0'}</div>
          </div>
        ))}
      </div>

      {/* ÁREA DA LISTAGEM (O "Coração" da imagem) */}
      <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        
        {/* Filtros e Busca */}
        <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: '14px', color: colors.primary, fontWeight: 'bold', textTransform: 'uppercase' }}>Listagem de Colaboradores</h3>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: colors.textGray }} />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                style={{ padding: '8px 12px 8px 35px', borderRadius: '8px', border: `1px solid ${colors.border}`, width: '250px' }}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button style={{ padding: '8px 15px', borderRadius: '8px', border: `1px solid ${colors.primary}`, color: colors.primary, background: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Download size={16} /> Exportar
            </button>
            <button 
              onClick={() => { setShowForm(true); setEditandoId(null); setFormData({nome:'', chapa:'', telefone:'', cpf:''}) }}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: colors.primary, color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
            >
              <Plus size={18} /> Novo
            </button>
          </div>
        </div>

        {/* TABELA */}
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {['NOME COMPLETO', 'REGISTRO (CHAPA)', 'TELEFONE', 'CPF', 'AÇÕES'].map((header) => (
                <th key={header} style={{ padding: '15px 20px', fontSize: '11px', color: colors.textGray, fontWeight: 600 }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {motoristas.filter(m => m.nome.toLowerCase().includes(busca.toLowerCase())).map((m) => (
              <tr key={m.id} style={{ borderBottom: `1px solid #f9fafb` }}>
                <td style={{ padding: '15px 20px', fontSize: '13px', fontWeight: 'bold', color: colors.textDark }}>{m.id} - {m.nome}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.chapa}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.telefone}</td>
                <td style={{ padding: '15px 20px', fontSize: '13px', color: colors.textGray }}>{m.cpf}</td>
                <td style={{ padding: '15px 20px', display: 'flex', gap: '10px' }}>
                  <button onClick={() => prepararEdicao(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textGray }}><Edit2 size={16} /></button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE CADASTRO/EDIÇÃO (Aparece ao clicar em Novo ou Editar) */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h3>{editandoId ? 'Editar Motorista' : 'Novo Motorista'}</h3>
            <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} placeholder="Nome" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
              <input style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} placeholder="Registro/Chapa" value={formData.chapa} onChange={e => setFormData({...formData, chapa: e.target.value})} />
              <input style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} placeholder="Telefone" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} />
              <input style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} placeholder="CPF" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: colors.primary, color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold' }}>Salvar</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, background: '#eee', border: 'none', padding: '10px', borderRadius: '6px' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoMotoristas;
