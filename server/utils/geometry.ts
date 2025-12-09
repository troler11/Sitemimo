// Calcula distância em metros entre dois pontos (Haversine simplificado ou Euclidiano ajustado)
export const calcularDistanciaRapida = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const degLen = 111195;
    const x = lat1 - lat2;
    const y = (lon1 - lon2) * Math.cos((lat1 + lat2) * Math.PI / 360);
    return degLen * Math.sqrt(x * x + y * y);
};

// Distância perpendicular (auxiliar para Douglas-Peucker)
const distanciaPerpendicularSq = (ponto: number[], linhaInicio: number[], linhaFim: number[]) => {
    const x = ponto[0], y = ponto[1];
    const x1 = linhaInicio[0], y1 = linhaInicio[1];
    const x2 = linhaFim[0], y2 = linhaFim[1];
    
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = (x - x1) * C + (y - y1) * D;
    const lenSq = C * C + D * D;
    const param = (lenSq !== 0) ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }

    const dx = x - xx;
    const dy = y - yy;
    return dx * dx + dy * dy;
};

// Algoritmo Ramer-Douglas-Peucker para simplificar polilinhas (reduz pontos para o mapa ficar leve)
export const simplificarRota = (pointList: number[][], epsilon = 0.0001): number[][] => {
    if (pointList.length < 3) return pointList;

    let dmaxSq = 0;
    let index = 0;
    const end = pointList.length - 1;
    const epsilonSq = epsilon * epsilon;

    for (let i = 1; i < end; i++) {
        const dSq = distanciaPerpendicularSq(pointList[i], pointList[0], pointList[end]);
        if (dSq > dmaxSq) {
            index = i;
            dmaxSq = dSq;
        }
    }

    if (dmaxSq > epsilonSq) {
        const res1 = simplificarRota(pointList.slice(0, index + 1), epsilon);
        const res2 = simplificarRota(pointList.slice(index), epsilon);
        return [...res1.slice(0, -1), ...res2];
    }

    return [pointList[0], pointList[end]];
};
