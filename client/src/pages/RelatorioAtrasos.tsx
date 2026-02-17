import React, { useEffect, useState } from 'react';

// Interfaces para manter a tipagem forte do Sitemimo
interface PontoParada {
  id: number;
  horario: string;
  tempoDiferenca: string | number;
  passou: boolean;
  atrasado: boolean; 
}

interface Relatorio {
  id: number;
  data: string;
  linhaDescricao: string;
  descricaoVeiculo: string;
  linhaCodigo: string;
  status: string;
  sentido: string; 
  empresa: { id: number; nome: string };
  pontoDeParadaRelatorio: PontoParada[];
}

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

const RelatorioAtrasos: React.FC = () => {
  const [dadosOriginal, setDadosOriginal] = useState<Relatorio[]>([]);
  const [dadosFiltrados, setDadosFiltrados] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // Mantém a data de hoje como padrão ao abrir o Sitemimo
  const [dataSelecionada, setDataSelecionada] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('TODAS');
  const [filtroSentido, setFiltroSentido] = useState<string>('TODOS');

  const converterParaMinutos = (tempo: string | number): number => {
    if (typeof tempo === 'number') return tempo;
    if (tempo && tempo.toString().includes(':')) {
      const [h, m] = tempo.toString().split(':').map(Number);
      return (h * 60) + m;
    }
    const n = parseInt(tempo?.toString() || '0', 10);
    return isNaN(n) ? 0 : n;
  };

  const calcularHorarioRealizado = (horarioBase: string, diferenca: string | number, estaAtrasado: boolean) => {
    if (!horarioBase) return '00:00';
    const [h, m] = horarioBase.split(':').map(Number);
    const minutosDiff = converterParaMinutos(diferenca);
    const data = new Date();
    data.setHours(h, m, 0, 0);
    
    const ajuste = estaAtrasado ? minutosDiff : -minutosDiff;
    data.setMinutes(data.getMinutes() + ajuste);
    
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const fetchData = async (dataParaBusca: string) => {
    setLoading(true);
    const parts = dataParaBusca.split('-');
    const dataFormatada = `${parseInt(parts[2])}/${parseInt(parts[1])}/${parts[0]}`;
    const url = `https://abmbus.com.br:8181/api/usuario/pesquisarelatorio?linhas=&empresas=3528816,3528804,3528807,3536646,3528817,3529151,3536839,3529224,3529142,3528920,3536708,3529024,3536624,3536600,3536756,3536730,3528806,3529220,3529258,3536796,3528893,3529153,3528928,3529147,3529222,3528872&dataInicial=${dataFormatada}&dataFinal=${dataFormatada}&periodo=&sentido=&agrupamentos=`;
    
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJtaW1vQGFibXByb3RlZ2UuY29tLmJyIiwiZXhwIjoxODcwMzE1NDA2fQ.WoOxG8y0D4iT1hJNxWisBlTmk2i5hVMwQmthRj00m9oWABF2pv_BZfICrASXf_Fkav8p4kZRydUHm-r6T1R9TA' }
      });
      const data = await response.json();
      const lista = Array.isArray(data) ? data : [data];
      const filtrados = lista.filter(item => {
        const pontos = item.pontoDeParadaRelatorio || [];
        if (pontos.length === 0) return false;
        const pontoRef = item.sentido === 'Saída' ? pontos[0] : pontos[pontos.length - 1];
        return pontoRef?.passou && pontoRef?.atrasado && converterParaMinutos(pontoRef.tempoDiferenca) > 10;
      });
      setDadosOriginal(filtrados);
    } catch (err) { 
      console.error(err); 
      setDadosOriginal([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(dataSelecionada); }, [dataSelecionada]);

  // Lógica de filtro e ordenação idêntica à funcional
  useEffect(() => {
    let resultado = [...dadosOriginal];
    if (filtroEmpresa !== 'TODAS') resultado = resultado.filter(d => d.empresa.nome === filtroEmpresa);
    if (filtroSentido !== 'TODOS') resultado = resultado.filter(d => d.sentido === filtroSentido);

    if (sortConfig) {
      const { key, direction } = sortConfig;
      resultado.sort((a, b) => {
        let valA: any, valB: any;
        const pInicA = a.pontoDeParadaRelatorio?.[0];
        const pFimA = a.pontoDeParadaRelatorio?.[a.pontoDeParadaRelatorio.length - 1];
        const pInicB = b.pontoDeParadaRelatorio?.[0];
        const pFimB = b.pontoDeParadaRelatorio?.[b.pontoDeParadaRelatorio.length - 1];

        switch (key) {
          case 'empresa': valA = a.empresa.nome; valB = b.empresa.nome; break;
          case 'prefixo': valA = a.descricaoVeiculo; valB = b.descricaoVeiculo; break;
          case 'sentido': valA = a.sentido; valB = b.sentido; break;
          case 'atraso': 
            valA = converterParaMinutos(a.sentido === 'Saída' ? pInicA?.tempoDiferenca : pFimA?.tempoDiferenca);
            valB = converterParaMinutos(b.sentido === 'Saída' ? pInicB?.tempoDiferenca : pFimB?.tempoDiferenca);
            break;
          default: valA = ''; valB = '';
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    setDadosFiltrados(resultado);
  }, [filtroEmpresa, filtroSentido, dadosOriginal, sortConfig]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-red-700 mb-6">⚠️ Monitoramento de Atrasos Críticos</h1>

      {/* Controles de Filtro adaptados ao estilo dashboard */}
      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <input type="date" value={dataSelecionada} onChange={(e) => setDataSelecionada(e.target.value)} className="p-2 border rounded" />
        <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="p-2 border rounded">
          <option value="TODAS">Empresas</option>
          {Array.from(new Set(dadosOriginal.map(d => d.empresa.nome))).sort().map(emp => <option key={emp} value={emp}>{emp}</option>)}
        </select>
        <select value={filtroSentido} onChange={(e) => setFiltroSentido(e.target.value)} className="p-2 border rounded">
          <option value="TODOS">Sentidos</option>
          <option value="Entrada">Entrada</option>
          <option value="Saída">Saída</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead className="text-black">
            <tr>
              {[
                { label: "Empresa / Linha", key: "empresa" },
                { label: "Prefixo", key: "prefixo" },
                { label: "Sentido", key: "sentido" },
                { label: "H. Inic. Prog.", key: "hInicProg" },
                { label: "H. Inic. Real.", key: "" },
                { label: "H. Final Prog.", key: "hFinalProg" },
                { label: "H. Final Real.", key: "" },
                { label: "Atraso", key: "atraso" }
              ].map((col) => (
                <th 
                  key={col.label}
                  onClick={() => col.key && setSortConfig({ key: col.key, direction: sortConfig?.direction === 'asc' ? 'desc' : 'asc' })}
                  className={`p-3 cursor-pointer ${col.key === 'atraso' ? 'bg-slate-800' : 'bg-red-600'}`}
                >
                  {col.label} {sortConfig?.key === col.key ? (sortConfig.direction === 'asc' ? '🔼' : '🔽') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dadosFiltrados.map((item) => {
              const pInic = item.pontoDeParadaRelatorio[0];
              const pFim = item.pontoDeParadaRelatorio[item.pontoDeParadaRelatorio.length - 1];
              const pRef = item.sentido === 'Saída' ? pInic : pFim;
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                  <td className="p-3 text-left">
                    <div className="font-bold">{item.empresa?.nome}</div>
                    <div className="text-xs text-gray-500">{item.linhaDescricao} ({item.linhaCodigo})</div>
                  </td>
                  <td className="p-3 font-medium">{item.descricaoVeiculo}</td>
                  <td className="p-3">{item.sentido}</td>
                  <td className="p-3">{pInic?.horario || '--:--'}</td>
                  <td className="p-3">{calcularHorarioRealizado(pInic?.horario, pInic?.tempoDiferenca, pInic?.atrasado)}</td>
                  <td className="p-3">{pFim?.horario || '--:--'}</td>
                  <td className="p-3 font-bold">{calcularHorarioRealizado(pFim?.horario, pFim?.tempoDiferenca, pFim?.atrasado)}</td>
                  <td className="p-3 text-red-600 font-bold">{`+${pRef?.tempoDiferenca} min`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && dadosFiltrados.length === 0 && (
          <div className="p-10 text-center text-gray-400">Nenhum atraso crítico para os filtros selecionados.</div>
        )}
      </div>
    </div>
  );
};

export default RelatorioAtrasos;
