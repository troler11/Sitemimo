import { Request, Response } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Usuário não encontrado" });
        }

        const user = result.rows[0];
        
        // Verifica Senha (compatível com password_hash do PHP)
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: "Senha incorreta" });
        }

        // Gera Token JWT (Substitui Session ID)
        const token = jwt.sign(
            { 
                id: user.id, 
                role: user.role, 
                allowed_companies: JSON.parse(user.allowed_companies || '[]') 
            },
            process.env.JWT_SECRET || 'secret_super_segura',
            { expiresIn: '24h' }
        );

        // Retorna dados para o Front salvar
        return res.json({
            token,
            user: {
                id: user.id,
                name: user.full_name,
                role: user.role,
                menus: JSON.parse(user.allowed_menus || '[]')
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Erro interno" });
    }
};
