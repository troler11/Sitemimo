import { Request, Response } from 'express';
import { motoristaSchema } from '../src/schemas/motoristaSchema';
import { pool } from '../db';
import { ZodError } from 'zod';

export const listarMotoristas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM motoristas ORDER BY id DESC');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao buscar motoristas." });
  }
};

export const cadastrarMotorista = async (req: Request, res: Response) => {
  try {
    const { nome, chapa, telefone, cpf } = motoristaSchema.parse(req.body);

    const query = `
      INSERT INTO motoristas (nome, chapa, telefone, cpf) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `;
    
    const result = await pool.query(query, [nome, chapa, telefone, cpf]);
    
    return res.status(201).json({ 
      message: "Motorista cadastrado!", 
      motorista: result.rows[0] 
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ errors: error.errors });
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
};

export const atualizarMotorista = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, chapa, telefone, cpf } = motoristaSchema.parse(req.body);

    const query = `
      UPDATE motoristas 
      SET nome = $1, chapa = $2, telefone = $3, cpf = $4 
      WHERE id = $5 
      RETURNING *
    `;

    const result = await pool.query(query, [nome, chapa, telefone, cpf, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Motorista não encontrado." });

    return res.status(200).json({ 
      message: "Dados atualizados!", 
      motorista: result.rows[0] 
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ errors: error.errors });
    return res.status(500).json({ error: "Erro ao atualizar motorista." });
  }
};

export const excluirMotorista = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM motoristas WHERE id = $1', [id]);
    return res.status(200).json({ message: "Motorista removido." });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao excluir motorista." });
  }
};
