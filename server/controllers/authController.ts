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
        
        // --- CORREÇÃO DE COMPATIBILIDADE PHP -> NODE ---
        let storedHash = user.password;

        // O PHP usa o prefixo "$2y$" para Bcrypt. O Node (bcryptjs) prefere "$2a$".
        // O algoritmo é o mesmo, então basta trocar o prefixo para validar.
        if (storedHash.startsWith('$2y$')) {
            storedHash = storedHash.replace('$2y$', '$2a$');
        }
        // ------------------------------------------------

        const validPassword = await bcrypt.compare(password, storedHash);
        
        if (!validPassword) {
            return res.status(401).json({ message: "Senha incorreta" });
        }

        // Gera Token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                role: user.role, 
                // Trata o caso de ser string JSON ou objeto já parseado pelo driver
                allowed_companies: typeof user.allowed_companies === 'string' 
                    ? JSON.parse(user.allowed_companies) 
                    : (user.allowed_companies || [])
            },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        return res.json({
            token,
            user: {
                id: user.id,
                name: user.full_name,
                role: user.role,
                menus: typeof user.allowed_menus === 'string'
                    ? JSON.parse(user.allowed_menus)
                    : (user.allowed_menus || [])
            }
        });

    } catch (error) {
        console.error("Erro Login:", error);
        return res.status(500).json({ message: "Erro interno" });
    }
};
