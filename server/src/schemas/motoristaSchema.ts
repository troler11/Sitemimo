import { z } from 'zod';

export const motoristaSchema = z.object({
  nome: z.string().min(3, "Nome muito curto"),
  chapa: z.string().min(2, "Chapa inválida"),
  telefone: z.string().min(10, "Telefone inválido (use DDD)"),
  cpf: z.string().length(11, "O CPF deve ter 11 dígitos numéricos")
    .regex(/^\d+$/, "O CPF deve conter apenas números")
});

export type MotoristaInput = z.infer<typeof motoristaSchema>;
