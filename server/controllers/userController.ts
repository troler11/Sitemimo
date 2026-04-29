import { Request, Response } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';

// --- UTILITÁRIO: LOG DE AUDITORIA ---
const logAction = async (userId: number, action: string, table: string, targetId: number, details?: string) => {
    try {
        await pool.query(
            'INSERT INTO audit_logs (user_id, action, table_name, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [userId, action, table, targetId, details || null]
        );
    } catch (err) {
        console.error("Falha ao registar auditoria:", err);
    }
};

// --- UTILITÁRIO: SANITIZAÇÃO ---
const sanitizeArray = (data: any): string[] => {
    if (!Array.isArray(data)) return [];
    return data.map((i: any) => String(i).trim()).filter((i: string) => i.length > 0);
};

// Listar Usuários com PAGINAÇÃO e FILTRO DE STATUS
export const getUsers = async (req: Request, res: Response) => {
    try {
        // Parâmetros de paginação
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        // Apenas usuários 'active' (Soft Delete)
        const result = await pool.query(
            `SELECT id, username, full_name, role, allowed_companies, allowed_menus 
             FROM users 
             WHERE status = 'active' 
             ORDER BY full_name ASC 
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const totalResult = await pool.query("SELECT COUNT(*) FROM users WHERE status = 'active'");
        const totalUsers = parseInt(totalResult.rows[0].count);

        const users = result.rows.map(u => ({
            ...u,
            allowed_companies: typeof u.allowed_companies === 'string' ? JSON.parse(u.allowed_companies) : (u.allowed_companies || []),
            allowed_menus: typeof u.allowed_menus === 'string' ? JSON.parse(u.allowed_menus) : (u.allowed_menus || [])
        }));

        return res.json({
            users,
            pagination: {
                total: totalUsers,
                pages: Math.ceil(totalUsers / limit),
                currentPage: page
            }
        });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao procurar utilizadores" });
    }
};

// Criar Usuário com AUDITORIA
export const createUser = async (req: Request, res: Response) => {
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    const adminId = (req as any).user?.id;

    if (!username || !password || !full_name || !role) return res.status(400).json({ error: "Dados incompletos" });

    try {
        const hash = await bcrypt.hash(password, 10);
        const comps = JSON.stringify(sanitizeArray(allowed_companies));
        const menus = JSON.stringify(sanitizeArray(allowed_menus));

        const result = await pool.query(
            'INSERT INTO users (username, password, full_name, role, allowed_companies, allowed_menus) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [username, hash, full_name, role, comps, menus]
        );

        const newId = result.rows[0].id;
        await logAction(adminId, 'CREATE', 'users', newId, `Utilizador ${username} criado.`);

        return res.status(201).json({ message: "Utilizador criado com sucesso" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao criar utilizador" });
    }
};

// Editar Usuário com AUDITORIA
export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    const adminId = (req as any).user?.id;

    try {
        const comps = JSON.stringify(sanitizeArray(allowed_companies));
        const menus = JSON.stringify(sanitizeArray(allowed_menus));

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET username=$1, password=$2, full_name=$3, role=$4, allowed_companies=$5, allowed_menus=$6 WHERE id=$7',
                [username, hash, full_name, role, comps, menus, id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username=$1, full_name=$2, role=$3, allowed_companies=$4, allowed_menus=$5 WHERE id=$6',
                [username, full_name, role, comps, menus, id]
            );
        }

        await logAction(adminId, 'UPDATE', 'users', Number(id), `Dados de ${username} atualizados.`);
        return res.json({ message: "Utilizador atualizado com sucesso" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao atualizar" });
    }
};

// SOFT DELETE com AUDITORIA
export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    if (Number(id) === adminId) {
        return res.status(403).json({ error: "Não pode desativar a sua própria conta." });
    }

    try {
        // Exclusão Lógica: Apenas mudamos o status para 'inactive'
        const result = await pool.query(
            "UPDATE users SET status = 'inactive' WHERE id = $1 RETURNING username", 
            [id]
        );

        if (result.rows.length > 0) {
            await logAction(adminId, 'SOFT_DELETE', 'users', Number(id), `Utilizador ${result.rows[0].username} desativado.`);
        }

        return res.json({ message: "Utilizador desativado do sistema" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao desativar utilizador" });
    }
};
