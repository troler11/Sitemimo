import { Request, Response } from 'express';
import { pool } from '../db';

export const createRota = async (req: Request, res: Response) => {
    // Precisamos de um cliente dedicado para fazer transação (BEGIN/COMMIT)
    const client = await pool.connect();

    try {
        const { descricao, codigo, sentido, cliente, empresa, diasOperacao, pontos, tracado_completo } = req.body;

        // 1. Validação básica
        if (!descricao || !pontos || pontos.length === 0) {
            return res.status(400).json({ error: "Dados inválidos." });
        }

        // --- INÍCIO DA TRANSAÇÃO ---
        await client.query('BEGIN');

        // 2. Inserir a Rota (Cabeçalho)
        const insertRotaQuery = `
            INSERT INTO rotas 
            (descricao, codigo, sentido, cliente, empresa, dias_operacao, tracado_completo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        
        // Convertendo traçado para JSON string se necessário, ou passando direto se o driver aceitar
        const valuesRota = [
            descricao, 
            codigo, 
            sentido, 
            cliente, 
            empresa, 
            diasOperacao, // O driver PG entende arrays nativos ou JSONB
            JSON.stringify(tracado_completo)
        ];

        const resRota = await client.query(insertRotaQuery, valuesRota);
        const rotaId = resRota.rows[0].id;

        // 3. Inserir os Pontos (Loop seguro dentro da transação)
        const insertPontoQuery = `
            INSERT INTO pontos_rota 
            (rota_id, ordem, nome, horario, latitude, longitude, tipo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        for (const p of pontos) {
            await client.query(insertPontoQuery, [
                rotaId, 
                p.ordem, 
                p.nome, 
                p.horario, 
                p.latitude, 
                p.longitude, 
                p.tipo
            ]);
        }

        // --- SUCESSO: CONFIRMA TUDO ---
        await client.query('COMMIT');

        return res.status(201).json({ message: "Rota cadastrada com sucesso!", id: rotaId });

    } catch (error) {
        // --- ERRO: DESFAZ TUDO ---
        await client.query('ROLLBACK');
        console.error("Erro ao criar rota:", error);
        return res.status(500).json({ error: "Erro ao salvar rota no banco de dados." });
    } finally {
        // Libera o cliente de volta para o pool
        client.release();
    }
};

export const getRotas = async (req: Request, res: Response) => {
    try {
        // Busca as rotas. 
        // Se você precisar trazer os pontos junto, precisaria fazer um JOIN ou buscar separadamente.
        // Abaixo, busco apenas as rotas ordenadas por data.
        const query = `
            SELECT * FROM rotas 
            ORDER BY criado_em DESC
        `;
        
        const result = await pool.query(query);

        // Se precisar converter nomes de colunas (snake_case para camelCase), faça aqui.
        // Por padrão o Postgres retorna snake_case (criado_em, dias_operacao)
        return res.json(result.rows);

    } catch (error) {
        console.error("Erro ao buscar rotas:", error);
        return res.status(500).json({ error: "Erro ao buscar rotas." });
    }
};
