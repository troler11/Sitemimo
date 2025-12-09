import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization'];

    if (!token) return res.status(403).json({ message: "Token necessário" });

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET || 'secret');
        (req as any).user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Token inválido" });
    }
};
