import NodeCache from 'node-cache';

// Cache global para previsões de chegada
// TTL de 300 segundos (5 minutos) igual ao original
export const predictionCache = new NodeCache({ stdTTL: 300 });
