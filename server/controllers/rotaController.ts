import { Request, Response } from 'express';
import Rota from '../models/Rota';

export const createRota = async (req: Request, res: Response) => {
    try {
        // Recebe os novos campos do body
        const { descricao, codigo, sentido, cliente, empresa, diasOperacao, pontos, tracado_completo } = req.body;

        if (!descricao || !pontos || pontos.length === 0) {
            return res.status(400).json({ error: "Dados inválidos." });
        }

        const novaRota = new Rota({
            descricao,
            codigo,
            sentido,
            cliente,
            empresa,          // <--- Salva empresa
            diasOperacao,     // <--- Salva dias
            pontos,
            tracado: tracado_completo || []
        });

        await novaRota.save();

        console.log(`[ROTA] Nova rota criada: ${descricao}`);
        return res.status(201).json({ message: "Rota cadastrada com sucesso!" });

    } catch (error) {
        console.error("Erro ao criar rota:", error);
        return res.status(500).json({ error: "Erro interno ao salvar rota." });
    }
};

export const getRotas = async (req: Request, res: Response) => {
    try {
        const rotas = await Rota.find().sort({ criadoEm: -1 });
        return res.json(rotas);
    } catch (error) {
        return res.status(500).json({ error: "Erro ao buscar rotas." });
    }
};
