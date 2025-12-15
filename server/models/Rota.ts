import mongoose, { Document, Schema } from 'mongoose';

export interface IRota extends Document {
    descricao: string;
    codigo: string;
    sentido: string;
    cliente: string;
    empresa: string;           // <--- ADICIONADO
    diasOperacao: boolean[];   // <--- ADICIONADO (Array de boolean)
    pontos: Array<{
        ordem: number;
        nome: string;
        horario: string;
        latitude: number;
        longitude: number;
        tipo: 'INICIAL' | 'PARADA' | 'FINAL';
    }>;
    tracado: any[]; 
    criadoEm: Date;
}

const RotaSchema: Schema = new Schema({
    descricao: { type: String, required: true },
    codigo: { type: String, required: true },
    sentido: { type: String, required: true },
    cliente: { type: String, required: true },
    empresa: { type: String, required: true },         // <--- ADICIONADO
    diasOperacao: { type: [Boolean], default: [] },    // <--- ADICIONADO
    pontos: [
        {
            ordem: { type: Number, required: true },
            nome: { type: String, required: true },
            horario: { type: String, default: "00:00" },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            tipo: { 
                type: String, 
                enum: ['INICIAL', 'PARADA', 'FINAL'], 
                default: 'PARADA' 
            }
        }
    ],
    tracado: { type: Array, default: [] }, 
    criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model<IRota>('Rota', RotaSchema);
