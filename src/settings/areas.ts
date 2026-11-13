/** As áreas da janela de Configurações, como a barra lateral as mostra, e o índice que a busca usa. */

export type AreaId = "atalhos" | "paginas" | "aparencia" | "musica" | "foco" | "claude" | "integracoes" | "shelf" | "geral" | "sistema";

export interface Area {
  id: AreaId;
  label: string;
  /** Uma linha sob o título: o que a área faz. */
  lead: string;
  /** O grupo da barra lateral (sem nome = as áreas principais, no topo). */
  group: "" | "Conexões" | "Sistema";
  /** As opções da área, para a busca achar (o nome de cada linha e palavras que alguém digitaria). */
  options: string[];
}

export const AREAS: Area[] = [
  {
    id: "atalhos",
    label: "Atalhos",
    lead: "Apps, jogos, pastas e sites que abrem com um clique.",
    group: "",
    options: ["Sugestões de atalhos", "Atalhos", "Confirmar antes de abrir", "Seções", "Organizar automaticamente", "Grupos", "Ícones automáticos", "Pasta dos ícones", "Ícones que faltam", "steam", "epic", "jogos"],
  },
  { id: "paginas", label: "Páginas e dock", lead: "O que aparece no dock da ilha, e em que ordem.", group: "", options: ["Páginas", "Ordem das páginas", "Voltar à ordem original", "dock"] },
  { id: "aparencia", label: "Aparência", lead: "Como a ilha se mostra.", group: "", options: ["Brilho ambiente", "Olhinhos", "Seguir o cursor", "Reduzir movimento", "cor", "animação"] },
  { id: "musica", label: "Música e letras", lead: "Letra sincronizada e o que está tocando.", group: "", options: ["Letra na pílula", "Atraso da letra", "Fonte das letras", "Players", "spotify", "lrclib"] },
  { id: "foco", label: "Foco e notas", lead: "O Pomodoro, o contador livre e onde as notas são salvas.", group: "", options: ["Foco", "Pausa curta", "Pausa longa", "Focos por ciclo", "Aviso ao terminar", "Som ao terminar", "Pasta das notas", "pomodoro", "timer", "obsidian"] },
  { id: "claude", label: "Claude Code", lead: "Veja o que o Claude está fazendo e aprove pedidos pela ilha.", group: "Conexões", options: ["Hooks do Claude Code", "Aprovar pela ilha", "Faixa “Claude trabalhando”", "Aviso “Claude terminou”", "Servidor local", "permissões"] },
  { id: "integracoes", label: "Agenda e clima", lead: "Google Agenda e a cidade do clima.", group: "Conexões", options: ["Cidade do clima", "Unidade", "Google Agenda", "ID do cliente", "Chave secreta", "Como criar o ID do cliente", "temperatura"] },
  { id: "shelf", label: "Shelf", lead: "Para onde vão os arquivos que você solta na ilha.", group: "Conexões", options: ["Ao enviar", "Adicionar pasta", "arquivos", "arrastar"] },
  { id: "geral", label: "Geral", lead: "Abrir com o Windows, telas, avisos e teclas.", group: "Sistema", options: ["Iniciar com o Windows", "Telas", "Abrir ao passar o mouse", "Esconder em tela cheia", "Aviso do carregador", "Aviso de volume", "Aviso do Foco", "Teclas", "Abrir e fechar a ilha", "monitor", "atalho de teclado"] },
  { id: "sistema", label: "Monitor do sistema", lead: "A página com o uso de processador, memória e placa de vídeo.", group: "Sistema", options: ["Atualizar a cada", "cpu", "memória", "gpu"] },
];

export const isArea = (value: string | null): value is AreaId => AREAS.some((a) => a.id === value);

export interface SearchHit {
  area: Area;
  /** A opção que casou, ou null quando foi o nome da própria área. */
  option: string | null;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** As opções que casam com a busca (sem acento e sem maiúsculas), as áreas primeiro, no máximo `limit`. */
export function searchOptions(query: string, limit = 8): SearchHit[] {
  const q = fold(query);
  if (!q) return [];
  const areas: SearchHit[] = AREAS.filter((a) => fold(a.label).includes(q)).map((area) => ({ area, option: null }));
  const options: SearchHit[] = AREAS.flatMap((area) => area.options.filter((o) => fold(o).includes(q) && fold(o) !== fold(area.label)).map((option) => ({ area, option })));
  return [...areas, ...options].slice(0, limit);
}
