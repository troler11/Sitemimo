import { Request, Response } from 'express';
import { motoristaSchema } from '../src/schemas/motoristaSchema'; // Ajuste o caminho se necessário
import { ZodError } from 'zod';

// ==========================================
// 1. CADASTRAR NOVO MOTORISTA (POST)
// ==========================================
export const cadastrarMotorista = async (req: Request, res: Response) => {
  try {
    // Validação rigorosa com Zod
    const dados = motoristaSchema.parse(req.body);

    // TODO: Lógica de INSERÇÃO no banco de dados 
    // Ex: const novoMotorista = await supabase.from('motoristas').insert([dados]).select();
    console.log("Salvando motorista no banco:", dados);

    // Simulando o retorno do banco com um ID fictício para o frontend não quebrar
    const motoristaCriado = { id: Date.now(), ...dados };

    return res.status(201).json({ 
      message: "Motorista cadastrado com sucesso!",
      motorista: motoristaCriado
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    return res.status(500).json({ error: "Erro interno no servidor ao cadastrar" });
  }
};

// ==========================================
// 2. LISTAR TODOS OS MOTORISTAS (GET)
// ==========================================
export const listarMotoristas = async (req: Request, res: Response) => {
  try {
    // TODO: Lógica de BUSCA no banco de dados
    // Ex: const { data: motoristas } = await supabase.from('motoristas').select('*');
    console.log("Buscando motoristas no banco...");

    // Dados fictícios simulando o que viria do seu banco de dados
    const motoristasMock = [
      { id: '1', nome: 'Carlos Silva', chapa: '1001', telefone: '11999999999', cpf: '12345678901' },
      { id: '2', nome: 'Ana Souza', chapa: '1002', telefone: '11888888888', cpf: '10987654321' }
    ];

    return res.status(200).json({ motoristas: motoristasMock });
  } catch (error) {
    console.error("Erro ao listar motoristas:", error);
    return res.status(500).json({ error: "Erro interno no servidor ao listar" });
  }
};

// ==========================================
// 3. ATUALIZAR MOTORISTA (PUT)
// ==========================================
export const atualizarMotorista = async (req: Request, res: Response) => {
  try {
    // Pegamos o ID que vem na URL (ex: /api/motoristas/123)
    const { id } = req.params;

    // Validamos novamente os dados recebidos para garantir que a edição não enviou dados inválidos
    const dadosAtualizados = motoristaSchema.parse(req.body);

    // TODO: Lógica de ATUALIZAÇÃO no banco de dados usando o ID
    // Ex: await supabase.from('motoristas').update(dadosAtualizados).eq('id', id);
    console.log(`Atualizando motorista de ID ${id} com os dados:`, dadosAtualizados);

    return res.status(200).json({ 
      message: "Motorista atualizado com sucesso!",
      motorista: { id, ...dadosAtualizados }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Erro ao atualizar motorista:", error);
    return res.status(500).json({ error: "Erro interno no servidor ao atualizar" });
  }
};
