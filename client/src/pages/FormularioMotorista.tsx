import React, { useState, useEffect } from 'react';

// Definindo a interface para o TypeScript não reclamar
interface Motorista {
  id?: string | number; // O ID vem do seu banco de dados
  nome: string;
  chapa: string;
  telefone: string;
  cpf: string;
}

const GerenciamentoMotoristas = () => {
  const [formData, setFormData] = useState<Motorista>({
    nome: '',
    chapa: '',
    telefone: '',
    cpf: ''
  });

  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [editandoId, setEditandoId] = useState<string | number | null>(null);

  // Busca os motoristas assim que o componente carrega
  useEffect(() => {
    carregarMotoristas();
  }, []);

  const carregarMotoristas = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/motoristas');
      if (response.ok) {
        const data = await response.json();
        setMotoristas(data.motoristas || data); // Ajuste dependendo de como sua API retorna
      }
    } catch (err) {
      console.error("Erro ao buscar motoristas", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Se tiver editandoId, faz um PUT. Se não, faz um POST.
      const url = editandoId 
        ? `http://localhost:3000/api/motoristas/${editandoId}` 
        : 'http://localhost:3000/api/motoristas';
      
      const method = editandoId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        alert(editandoId ? "Motorista atualizado!" : "Motorista cadastrado!");
        setFormData({ nome: '', chapa: '', telefone: '', cpf: '' });
        setEditandoId(null);
        carregarMotoristas(); // Recarrega a lista
      } else {
        alert("Erro: " + JSON.stringify(result.errors || result.error));
      }
    } catch (err) {
      console.error("Erro ao conectar com o servidor", err);
    }
  };

  const prepararEdicao = (motorista: Motorista) => {
    setFormData({
      nome: motorista.nome,
      chapa: motorista.chapa,
      telefone: motorista.telefone,
      cpf: motorista.cpf
    });
    setEditandoId(motorista.id!);
  };

  const cancelarEdicao = () => {
    setFormData({ nome: '', chapa: '', telefone: '', cpf: '' });
    setEditandoId(null);
  };

  // --- Estilos embutidos para deixar mais bonito sem precisar de arquivos CSS externos ---
  const styles = {
    container: { display: 'flex', gap: '30px', flexWrap: 'wrap' as const, padding: '20px', fontFamily: 'system-ui, sans-serif' },
    card: { backgroundColor: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', flex: '1', minWidth: '300px' },
    title: { marginTop: 0, marginBottom: '20px', color: '#333', fontSize: '1.5rem' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555', fontSize: '0.9rem' },
    input: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' as const, fontSize: '1rem' },
    btnPrincipal: { width: '100%', padding: '12px', backgroundColor: editandoId ? '#f59e0b' : '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', transition: 'background-color 0.2s' },
    btnSecundario: { width: '100%', padding: '12px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', marginTop: '10px' },
    listaContainer: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
    itemLista: { padding: '15px', border: '1px solid #e5e7eb', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    itemText: { margin: 0, color: '#374151' },
    btnEditar: { padding: '6px 12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }
  };

  return (
    <div style={styles.container}>
      
      {/* Coluna do Formulário */}
      <div style={styles.card}>
        <h2 style={styles.title}>{editandoId ? 'Editar Motorista' : 'Novo Motorista'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome:</label>
            <input type="text" style={styles.input} value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required placeholder="Ex: João da Silva" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Chapa:</label>
            <input type="text" style={styles.input} value={formData.chapa} onChange={e => setFormData({...formData, chapa: e.target.value})} required placeholder="Ex: 12345" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Telefone:</label>
            <input type="text" style={styles.input} value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} required placeholder="(11) 99999-9999" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>CPF (só números):</label>
            <input type="text" style={styles.input} value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} required placeholder="12345678901" />
          </div>
          
          <button type="submit" style={styles.btnPrincipal}>
            {editandoId ? 'Atualizar Dados' : 'Cadastrar Motorista'}
          </button>
          
          {editandoId && (
            <button type="button" style={styles.btnSecundario} onClick={cancelarEdicao}>
              Cancelar Edição
            </button>
          )}
        </form>
      </div>

      {/* Coluna da Listagem */}
      <div style={styles.card}>
        <h2 style={styles.title}>Motoristas Cadastrados</h2>
        
        {motoristas.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center' }}>Nenhum motorista cadastrado ainda.</p>
        ) : (
          <div style={styles.listaContainer}>
            {motoristas.map((motorista) => (
              <div key={motorista.id} style={styles.itemLista}>
                <div>
                  <h4 style={{ margin: '0 0 5px 0', color: '#111827' }}>{motorista.nome}</h4>
                  <p style={styles.itemText}><small>Chapa: {motorista.chapa} | Tel: {motorista.telefone}</small></p>
                </div>
                <button style={styles.btnEditar} onClick={() => prepararEdicao(motorista)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default GerenciamentoMotoristas;
