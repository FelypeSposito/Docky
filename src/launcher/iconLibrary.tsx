import type { ReactNode } from "react";

/**
 * A biblioteca de ícones do Docky: formas simples, de traço fino, no mesmo estilo dos ícones da ilha. Servem para
 * atalhos e pastas da Shelf que não têm uma foto. No campo de ícone ficam como `lib:nome`.
 */
export interface LibraryIcon {
  id: string;
  label: string;
  glyph: ReactNode;
}

export const LIBRARY: LibraryIcon[] = [
  { id: "folder", label: "Pasta", glyph: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  { id: "file", label: "Arquivo", glyph: <path d="M6 3h8l4 4v14H6zM14 3v4h4" /> },
  {
    id: "image",
    label: "Imagem",
    glyph: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-8 8" />
      </>
    ),
  },
  {
    id: "music",
    label: "Música",
    glyph: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="16" r="2" />
      </>
    ),
  },
  {
    id: "video",
    label: "Vídeo",
    glyph: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M10 9l5 3-5 3z" />
      </>
    ),
  },
  {
    id: "game",
    label: "Jogos",
    glyph: (
      <>
        <rect x="2" y="8" width="20" height="10" rx="5" />
        <path d="M7 11v4M5 13h4M16 12h.01M18.5 14h.01" />
      </>
    ),
  },
  { id: "code", label: "Código", glyph: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" /> },
  {
    id: "terminal",
    label: "Terminal",
    glyph: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 10l3 2-3 2M12 15h5" />
      </>
    ),
  },
  {
    id: "globe",
    label: "Site",
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
  },
  { id: "chat", label: "Conversa", glyph: <path d="M4 5h16v11H9l-5 4z" /> },
  {
    id: "mail",
    label: "E-mail",
    glyph: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
  },
  {
    id: "calendar",
    label: "Agenda",
    glyph: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: "briefcase",
    label: "Trabalho",
    glyph: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5h6v2M3 13h18" />
      </>
    ),
  },
  { id: "book", label: "Estudo", glyph: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" /> },
  {
    id: "camera",
    label: "Câmera",
    glyph: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    id: "headphones",
    label: "Fones",
    glyph: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z" />,
  },
  {
    id: "monitor",
    label: "Tela",
    glyph: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M9 20h6M12 16v4" />
      </>
    ),
  },
  { id: "cloud", label: "Nuvem", glyph: <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17.5 18z" /> },
  { id: "download", label: "Downloads", glyph: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" /> },
  { id: "pen", label: "Notas", glyph: <path d="M4 20l1-4L16 5l3 3L8 19z" /> },
  { id: "chart", label: "Gráfico", glyph: <path d="M4 4v16h16M8 16v-4M12 16V8M16 16v-6" /> },
  { id: "bolt", label: "Rápido", glyph: <path d="M13 3L5 14h6l-1 7 8-11h-6z" /> },
  { id: "star", label: "Favorito", glyph: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /> },
  { id: "heart", label: "Coração", glyph: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /> },
  {
    id: "home",
    label: "Casa",
    glyph: <path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />,
  },
  {
    id: "cart",
    label: "Compras",
    glyph: (
      <>
        <path d="M3 4h3l2 11h10l2-8H7" />
        <circle cx="9" cy="19" r="1.4" />
        <circle cx="17" cy="19" r="1.4" />
      </>
    ),
  },
  {
    id: "coffee",
    label: "Pausa",
    glyph: <path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" />,
  },
  {
    id: "lock",
    label: "Cofre",
    glyph: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    id: "pin",
    label: "Lugar",
    glyph: (
      <>
        <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
  },
  {
    id: "users",
    label: "Pessoas",
    glyph: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M17 14a5 5 0 0 1 4 6" />
      </>
    ),
  },
  {
    id: "rocket",
    label: "Projeto",
    glyph: (
      <>
        <path d="M12 3c4 2 6 6 5 11l-3 3h-4l-3-3C6 9 8 5 12 3zM9 17l-3 4 4-1M15 17l3 4-4-1" />
        <circle cx="12" cy="10" r="1.5" />
      </>
    ),
  },
];

const BY_ID = new Map(LIBRARY.map((icon) => [icon.id, icon]));

export const libraryIcon = (id: string): LibraryIcon | undefined => BY_ID.get(id);

/** `lib:nome` → `nome` (ou null se não for um ícone da biblioteca). */
export const libraryId = (icon: string): string | null => {
  const match = /^lib:([a-z0-9-]+)$/.exec(icon.trim());
  return match ? match[1] : null;
};

/** O desenho de um ícone da biblioteca, no tamanho pedido, com a cor do texto. */
export function Glyph({ id, size = 16, stroke = 1.8 }: { id: string; size?: number; stroke?: number }) {
  const icon = libraryIcon(id);
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon.glyph}
    </svg>
  );
}
