// src/utils/geo.ts

export interface Coordenada {
    lat: number;
    lng: number;
}

// Calcula a distância aproximada em metros entre dois pontos
function getDistanciaMetros(p1: Coordenada, p2: Coordenada): number {
    const R = 6371e3; // Raio da Terra
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Encontra o índice do array da rota que está mais próximo geograficamente do veículo.
 */
export const findNearestPointIndex = (rota: Coordenada[], veiculo: Coordenada): number => {
    if (!rota || rota.length === 0) return -1;
    
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < rota.length; i++) {
        const dist = getDistanciaMetros(rota[i], veiculo);
        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }
    return closestIndex;
};
