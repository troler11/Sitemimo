import React, { useState } from 'react';

const FormularioMotorista = () => {
  const [formData, setFormData] = useState({
    nome: '',
    chapa: '',
    telefone: '',
    cpf: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('http://localhost:3000/api/motoristas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        alert("Motorista cadastrado!");
        setFormData({ nome: '', chapa: '', telefone: '', cpf: '' }); // Limpa o form
      } else {
        alert("Erro: " + JSON.stringify(result.errors || result.error));
      }
    } catch (err) {
      console.error("Erro ao conectar com o servidor", err);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px' }}>
      <h2>Cadastro de Motorista</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Nome:</label><br/>
          <input type="text" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
        </div>
        <div>
          <label>Chapa:</label><br/>
          <input type="text" value={formData.chapa} onChange={e => setFormData({...formData, chapa: e.target.value})} required />
        </div>
        <div>
          <label>Telefone:</label><br/>
          <input type="text" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} required />
        </div>
        <div>
          <label>CPF (só números):</label><br/>
          <input type="text" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} required />
        </div>
        <button type="submit" style={{ marginTop: '10px' }}>Cadastrar Motorista</button>
      </form>
    </div>
  );
};

export default FormularioMotorista;
