import { Request, Response } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';

// --- FUNÇÃO DE SEGURANÇA: SANITIZAÇÃO DE ARRAYS ---
// Garante que só passem textos limpos (como os nomes das suas empresas e menus)
const sanitizeStringArray = (data: any): string[] => {
    if (!Array.isArray(data)) return [];
    return data
        .map((item: any) => String(item).trim())
        .filter((item: string) => item.length > 0 && item !== "undefined" && item !== "null");
};

// Listar Usuários
export const getUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, allowed_companies, allowed_menus FROM users ORDER BY full_name ASC');
        
        const users = result.rows.map(u => ({
            ...u,
            allowed_companies: typeof u.allowed_companies === 'string' ? JSON.parse(u.allowed_companies) : (u.allowed_companies || []),
            allowed_menus: typeof u.allowed_menus === 'string' ? JSON.parse(u.allowed_menus) : (u.allowed_menus || [])
        }));
        
        return res.json(users);
    } catch (error) {
        console.error("🚨 Erro GET /users:", error);
        return res.status(500).json({ error: "Erro interno ao buscar usuários" });
    }
};

// Criar Usuário
export const createUser = async (req: Request, res: Response) => {
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    
    // 1. Validação de campos obrigatórios
    if (!username || !password || !full_name || !role) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    try {
        // 2. Prevenção de duplicatas (Evita Erro 500 do Banco)
        const checkUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (checkUser.rows.length > 0) {
            return res.status(409).json({ error: "Este nome de usuário já está em uso." });
        }

        const hash = await bcrypt.hash(password, 10);
        
        // 3. Sanitização dos arrays (Limpa espaços e dados inválidos)
        const safeCompanies = sanitizeStringArray(allowed_companies);
        const safeMenus = sanitizeStringArray(allowed_menus);

        await pool.query(
            'INSERT INTO users (username, password, full_name, role, allowed_companies, allowed_menus) VALUES ($1, $2, $3, $4, $5, $6)',
            [username, hash, full_name, role, JSON.stringify(safeCompanies), JSON.stringify(safeMenus)]
        );
        return res.status(201).json({ message: "Usuário criado com sucesso!" });
    } catch (error) {
        console.error("🚨 Erro CREATE /users:", error);
        return res.status(500).json({ error: "Erro interno ao criar usuário" });
    }
};

// Editar Usuário
export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    
    // 4. Proteção de ID: Garante que é um número
    if (isNaN(Number(id))) return res.status(400).json({ error: "ID de usuário inválido." });

    if (!username || !full_name || !role) {
        return res.status(400).json({ error: "Nome de usuário, nome completo e cargo são obrigatórios." });
    }

    try {
        // Sanitização dos arrays
        const safeCompanies = sanitizeStringArray(allowed_companies);
        const safeMenus = sanitizeStringArray(allowed_menus);
        const compsJson = JSON.stringify(safeCompanies);
        const menusJson = JSON.stringify(safeMenus);

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET username=$1, password=$2, full_name=$3, role=$4, allowed_companies=$5, allowed_menus=$6 WHERE id=$7',
                [username, hash, full_name, role, compsJson, menusJson, id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username=$1, full_name=$2, role=$3, allowed_companies=$4, allowed_menus=$5 WHERE id=$6',
                [username, full_name, role, compsJson, menusJson, id]
            );
        }
        return res.json({ message: "Usuário atualizado com sucesso!" });
    } catch (error) {
        console.error("🚨 Erro UPDATE /users:", error);
        return res.status(500).json({ error: "Erro interno ao atualizar usuário" });
    }
};

// Deletar Usuário
export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    
    // Verifica qual é o ID do admin que está fazendo a requisição (veio do token)
    const adminIdLogado = (req as any).user?.id;

    if (isNaN(Number(id))) return res.status(400).json({ error: "ID de usuário inválido." });

    // 5. Prevenção contra Auto-Exclusão
    if (Number(id) === adminIdLogado) {
        return res.status(403).json({ error: "Segurança: Você não pode deletar a sua própria conta." });
    }

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }

        return res.json({ message: "Usuário removido com sucesso!" });
    } catch (error) {
        console.error("🚨 Erro DELETE /users:", error);
        return res.status(500).json({ error: "Erro interno ao deletar usuário" });
    }
};
