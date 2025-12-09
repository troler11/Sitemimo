import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../db';
import NodeCache from 'node-cache';

// Cache em memória (substitui o cache de arquivo do PHP)
const appCache = new NodeCache({ stdTTL: 30 }); // 30 segundos

// URLs e Tokens do seu config.php
const URL_DASHBOARD_MAIN = "https://abmbus.com.br:8181/api/dashboard/mongo/95?naoVerificadas=false&agrupamentos=";
const HEADERS_DASHBOARD_MAIN = {
    "Accept": "application/json, text/plain, */*",
    "Authorization": process.env.TOKEN_ABMBUS
};

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user; // Do middleware de auth
        const allowedCompanies: string[] = user.role === 'admin' ? [] : user.allowed_companies;

        // 1. Check Cache
        let dashboardData = appCache.get('dashboard_main');
        
        if (!dashboardData) {
            // Requisicao Externa (Substitui simple_get do PHP)
            const response = await axios.get(URL_DASHBOARD_MAIN, { 
                headers: HEADERS_DASHBOARD_MAIN,
                timeout: 30000 
            });
            dashboardData = response.data;
            appCache.set('dashboard_main', dashboardData);
        }

        const data: any = dashboardData;
        let todasLinhas: any[] = [];
        
        // Normaliza permissões
        const allowedNorm = allowedCompanies.map(c => c.toUpperCase().trim());

        // Função auxiliar de processamento (Igual ao seu PHP closure)
        const processarGrupo = (lista: any[], categoria: string) => {
            if (!lista) return;
            
            for (const l of lista) {
                // Filtro de Empresa
                const empNome = (l.empresa?.nome || '').toUpperCase().trim();
                if (allowedNorm.length > 0 && !allowedNorm.includes(empNome)) {
                    continue;
                }

                // Filtro Finalizada
                const finalizada = l.pontoDeParadas?.some((p: any) => 
                    p.tipoPonto?.tipo === "Final" && p.passou
                );
                if (finalizada) continue;

                // Lógica de Horários (Simplificada da sua versão PHP)
                let horarioProg = "N/D";
                let horarioReal = "N/D";
                let statusTempo = "indefinido";

                // ... (Aqui você insere a lógica de cálculo de data/hora do seu PHP functions.php)
                // Devido ao tamanho, estou resumindo a estrutura:
                
                todasLinhas.push({
                    id: l.idLinha || l.id,
                    e: l.empresa?.nome,
                    r: l.descricaoLinha,
                    v: l.veiculo?.veiculo,
                    s: l.sentidoIda ? 1 : 0,
                    pi: horarioProg,
                    ri: horarioReal,
                    c: categoria
                    // ... outros campos otimizados
                });
            }
        };

        processarGrupo(data.linhasAndamento, "Em andamento");
        processarGrupo(data.linhasCarroDesligado, "Carro desligado");
        processarGrupo(data.linhasComecaramSemPrimeiroPonto, "Começou sem ponto");

        // Retorna JSON para o React
        return res.json({ todas_linhas: todasLinhas, hora: new Date().toLocaleTimeString() });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Erro ao buscar dados externos" });
    }
};
