interface EmptyStateProps {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}

/**
 * Aviso para quando uma página não tem nada para mostrar. É compacto de propósito: o corpo da ilha tem só
 * 148 px de altura, então o texto é limitado a três linhas e o botão nunca sai do bloco.
 */
export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="tile empty">
      <b>{title}</b>
      <span>{text}</span>
      {action && (
        <button className="btn sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
