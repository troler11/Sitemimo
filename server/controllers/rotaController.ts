import { Request, Response } from 'express';
import { supabase } from '../database/supabase';

export const createRota = async (req: Request, res: Response) => {
    try {
        const { descricao, codigo, sentido, cliente, empresa, diasOperacao, pontos, tracado_completo } = req.body;

        // 1. Validação básica
        if (!descricao || !pontos || pontos.length === 0) {
            return res.status(400).json({ error: "Dados inválidos." });
        }

        // 2. Inserir a Rota (Cabeçalho)
        const { data: rotaData, error: rotaError } = await supabase
            .from('rotas')
            .insert([
                {
                    descricao,
                    codigo,
                    sentido,
                    cliente,
                    empresa,
                    dias_operacao: diasOperacao, // Array de booleanos [true, false...]
                    tracado_completo: tracado_completo // JSON do traçado
                }
            ])
            .select() // Retorna os dados inseridos (precisamos do ID)
            .single();

        if (rotaError) {
            console.error('Erro Supabase Rota:', rotaError);
            throw rotaError;
        }

        const rotaId = rotaData.id;

        // 3. Preparar os Pontos para inserção em massa
        const pontosFormatados = pontos.map((p: any) => ({
            rota_id: rotaId,
            ordem: p.ordem,
            nome: p.nome,
            horario: p.horario,
            latitude: p.latitude,
            longitude: p.longitude,
            tipo: p.tipo
        }));

        // 4. Inserir os Pontos
        const { error: pontosError } = await supabase
            .from('pontos_rota')
            .insert(pontosFormatados);

        if (pontosError) {
            // Se der erro nos pontos, idealmente deletamos a rota criada para não ficar "órfã"
            await supabase.from('rotas').delete().eq('id', rotaId);
            console.error('Erro Supabase Pontos:', pontosError);
            throw pontosError;
        }

        return res.status(201).json({ message: "Rota cadastrada com sucesso!", id: rotaId });

    } catch (error) {
        console.error("Erro interno:", error);
        return res.status(500).json({ error: "Erro ao salvar rota no banco de dados." });
    }
};

export const getRotas = async (req: Request, res: Response) => {
    try {
        // Busca rotas e já traz os pontos relacionados (join)
        const { data, error } = await supabase
            .from('rotas')
            .select(`
                *,
                pontos_rota (*)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.json(data);
    } catch (error) {
        return res.status(500).json({ error: "Erro ao buscar rotas." });
    }
};
