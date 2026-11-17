/**
 * A small Clawd (clawd-pet animated SVG, MIT; see src/assets/clawd/README.md) cropped to the pill: the SVG canvas is 45
 * units and Clawd 15, so it is drawn at 1.75 px per unit inside a 30 px square. Mounted only while it shows, since the
 * animation lives inside the SVG and cannot be paused from outside.
 */
export function ClawdMini({ src, show }: { src: string; show: boolean }) {
  return <span className="clawd-mini" aria-hidden="true">{show && <img src={src} alt="" draggable={false} />}</span>;
}
