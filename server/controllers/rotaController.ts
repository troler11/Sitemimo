import { Request, Response } from 'express';
import Rota from '../models/Rota';

export const createRota = async (req: Request, res: Response) => {
    try {
        // 1. Recebe os dados que vieram do Frontend
        const { descricao, codigo, sentido, cliente, pontos, tracado } = req.body;

        // 2. Validação básica
        if (!descricao || !pontos || pontos.length === 0) {
            return res.status(400).json({ error: "Dados inválidos. A rota precisa ter descrição e pontos." });
        }

        // 3. Cria a nova rota na memória
        const novaRota = new Rota({
            descricao,
            codigo,
            sentido,
            cliente,
            pontos,
            tracado // Opcional
        });

        // 4. Salva no MongoDB
        await novaRota.save();

        console.log(`[ROTA] Nova rota criada: ${descricao} (${pontos.length} pontos)`);

        return res.status(201).json({ 
            message: "Rota cadastrada com sucesso!",
            id: novaRota._id 
        });

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
