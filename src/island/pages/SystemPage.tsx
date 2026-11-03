import { useEffect, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc, type SystemStats } from "../../lib/ipc";
import { orderPages } from "../pageOrder";
import { useGridSort } from "../useGridSort";

const CIRCUMFERENCE = 182.2;

/** O Windows chama de "GB" o que é GiB (1024³ bytes); com 1e9 a memória de 64 GB apareceria como 68,7. */
const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(1).replace(".", ",");
const gigahertz = (mhz: number) => `${(mhz / 1000).toFixed(2).replace(".", ",")} GHz`;

function Ring({ id, percent, label, caption, sorter }: { id: string; percent: number | null; label: string; caption: string; sorter: ReturnType<typeof useGridSort> }) {
  const clamped = Math.min(100, Math.max(0, percent ?? 0));
  return (
    <div
      className={`tile sm${sorter.dragId === id ? " drag" : ""}`}
      ref={sorter.tileRef(id)}
      style={{ order: sorter.position.get(id) }}
      title="Arraste para mudar a ordem"
      onPointerDown={(e) => sorter.down(e, id)}
    >
      <div className="rg">
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <circle className="rb" cx="36" cy="36" r="29" />
          <circle className="rf" cx="36" cy="36" r="29" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)} />
        </svg>
        <b>{percent === null ? "—" : `${Math.round(clamped)}%`}</b>
      </div>
      <label>{label}</label>
      <small>{caption}</small>
    </div>
  );
}

export function SystemPage({ active }: { active: boolean }) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const refreshMs = useConfigStore((s) => s.config.systemRefreshMs);
  const savedOrder = useConfigStore((s) => s.config.systemOrder);
  const update = useConfigStore((s) => s.update);

  // Só consulta enquanto a página está aberta.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = () => void ipc.systemStats().then((next) => alive && setStats(next));
    read();
    const timer = setInterval(read, refreshMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, refreshMs]);

  const memoryPercent = stats ? (stats.memoryUsed / Math.max(1, stats.memoryTotal)) * 100 : 0;
  const gpuCaption = !stats ? "…" : stats.gpuMemoryUsed !== null ? `${gigabytes(stats.gpuMemoryUsed)} GB de vídeo` : "sem dados da GPU";

  const meters = [
    { id: "cpu", percent: stats?.cpu ?? 0, label: "CPU", caption: stats?.cpuMhz ? gigahertz(stats.cpuMhz) : "processador" },
    { id: "memory", percent: memoryPercent, label: "Memória", caption: stats ? `${gigabytes(stats.memoryUsed)} de ${gigabytes(stats.memoryTotal)} GB` : "…" },
    { id: "gpu", percent: stats ? stats.gpu : 0, label: "GPU", caption: gpuCaption },
  ];
  // Os medidores se reordenam arrastando; a ordem fica nas configurações.
  const sorter = useGridSort(
    orderPages(meters, savedOrder).map((m) => m.id),
    (order) => update({ systemOrder: order }),
  );

  return (
    <div className="bento sy">
      {meters.map((meter) => (
        <Ring key={meter.id} {...meter} sorter={sorter} />
      ))}
    </div>
  );
}
