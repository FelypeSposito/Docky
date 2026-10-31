export interface HoverControllerOptions {
  /** Espera antes de expandir, para não abrir quando o mouse só passa pela ilha. */
  expandDelay?: number;
  /** Espera antes de recolher, para tolerar uma saída rápida do mouse. */
  collapseDelay?: number;
  canExpand: () => boolean;
  canCollapse: () => boolean;
  expand: () => void;
  collapse: () => void;
}

export interface HoverController {
  setHover: (inside: boolean) => void;
  dispose: () => void;
}

export function createHoverController(options: HoverControllerOptions): HoverController {
  const { expandDelay = 130, collapseDelay = 380 } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    setHover(inside) {
      clearTimeout(timer);
      if (inside) {
        if (options.canExpand()) timer = setTimeout(options.expand, expandDelay);
      } else {
        timer = setTimeout(() => {
          if (options.canCollapse()) options.collapse();
        }, collapseDelay);
      }
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
