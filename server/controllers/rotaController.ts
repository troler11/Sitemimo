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
        // Removemos o ORDER BY criado_em para evitar erro se a coluna tiver outro nome
        // Ou troque 'criado_em' por 'id' que é garantido que existe
        const query = `SELECT * FROM rotas ORDER BY id DESC`; 
        
        const result = await pool.query(query);
        return res.json(result.rows);

    } catch (error) {
        // Adicione este log para você ver o erro real no terminal
        console.error("ERRO REAL DO SQL:", error); 
        return res.status(500).json({ error: "Erro ao buscar rotas." });
    }
};

// ... imports existentes

// 1. BUSCAR UMA ROTA ESPECÍFICA (Para preencher a tela de edição)
// server/controllers/rotaController.ts

export const getRotaById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        // 1. Busca a Rota
        const rotaResult = await pool.query('SELECT * FROM rotas WHERE id = $1', [id]);
        
        if (rotaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Rota não encontrada no banco' });
        }

        // 2. Busca os Pontos
        const pontosResult = await pool.query('SELECT * FROM pontos_rota WHERE rota_id = $1 ORDER BY ordem ASC', [id]);

        // 3. Monta o objeto final
        // Importante: clonar o objeto para não ter problemas de referência
        const rota = { ...rotaResult.rows[0] };
        
        // Anexa os pontos
        rota.pontos = pontosResult.rows; 

        return res.json(rota);

    } catch (error) {
        console.error("Erro no GetById:", error);
        return res.status(500).json({ error: "Erro interno." });
    }
};

// 2. ATUALIZAR A ROTA (PUT)
export const updateRota = async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { descricao, codigo, sentido, cliente, empresa, diasOperacao, pontos, tracado_completo } = req.body;

        await client.query('BEGIN');

        // Atualiza a tabela principal
        await client.query(`
            UPDATE rotas 
            SET descricao=$1, codigo=$2, sentido=$3, cliente=$4, empresa=$5, dias_operacao=$6, tracado_completo=$7
            WHERE id=$8
        `, [descricao, codigo, sentido, cliente, empresa, diasOperacao, JSON.stringify(tracado_completo), id]);

        // Estratégia segura: Remove todos os pontos antigos e insere os novos
        await client.query('DELETE FROM pontos_rota WHERE rota_id = $1', [id]);

        const insertPontoQuery = `
            INSERT INTO pontos_rota (rota_id, ordem, nome, horario, latitude, longitude, tipo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        for (const p of pontos) {
            await client.query(insertPontoQuery, [
                id, p.ordem, p.nome, p.horario, p.latitude, p.longitude, p.tipo
            ]);
        }

        await client.query('COMMIT');
        return res.json({ message: "Rota atualizada com sucesso!" });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao atualizar:", error);
        return res.status(500).json({ error: "Erro ao atualizar rota." });
    } finally {
        client.release();
    }
};
