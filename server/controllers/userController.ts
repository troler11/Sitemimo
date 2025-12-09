import { Request, Response } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';

// Listar Usuários
export const getUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, allowed_companies, allowed_menus FROM users ORDER BY full_name ASC');
        // Parseia os JSONs que vêm do banco como string
        const users = result.rows.map(u => ({
            ...u,
            allowed_companies: typeof u.allowed_companies === 'string' ? JSON.parse(u.allowed_companies) : u.allowed_companies,
            allowed_menus: typeof u.allowed_menus === 'string' ? JSON.parse(u.allowed_menus) : u.allowed_menus
        }));
        return res.json(users);
    } catch (error) {
        return res.status(500).json({ error: "Erro ao buscar usuários" });
    }
};

// Criar Usuário
export const createUser = async (req: Request, res: Response) => {
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        // Salva arrays como JSON string para compatibilidade com seu banco atual
        const compsJson = JSON.stringify(allowed_companies || []);
        const menusJson = JSON.stringify(allowed_menus || []);

        await pool.query(
            'INSERT INTO users (username, password, full_name, role, allowed_companies, allowed_menus) VALUES ($1, $2, $3, $4, $5, $6)',
            [username, hash, full_name, role, compsJson, menusJson]
        );
        return res.status(201).json({ message: "Usuário criado" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao criar usuário" });
    }
};

// Editar Usuário
export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username, password, full_name, role, allowed_companies, allowed_menus } = req.body;
    
    try {
        const compsJson = JSON.stringify(allowed_companies || []);
        const menusJson = JSON.stringify(allowed_menus || []);

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
        return res.json({ message: "Usuário atualizado" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao atualizar" });
    }
};

// Deletar Usuário
export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        return res.json({ message: "Usuário removido" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao deletar" });
    }
};
