import { Request, Response } from 'express';
import { motoristaSchema } from '../schemas/motoristaSchema';
import { ZodError } from 'zod';

export const cadastrarMotorista = async (req: Request, res: Response) => {
  try {
    // Validação rigorosa com Zod
    const dados = motoristaSchema.parse(req.body);

    // TODO: Lógica de banco de dados (Ex: await db.motoristas.create({ data: dados }))
    console.log("Salvando motorista:", dados);

    return res.status(201).json({ message: "Motorista cadastrado com sucesso!" });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
};
