import { useEffect, useState } from "react";
import { ipc, type SystemStats } from "../../lib/ipc";

const CIRCUMFERENCE = 182.2;

const gigabytes = (bytes: number) => (bytes / 1e9).toFixed(1).replace(".", ",");
const gigahertz = (mhz: number) => `${(mhz / 1000).toFixed(2).replace(".", ",")} GHz`;

function Ring({ percent, label, caption }: { percent: number | null; label: string; caption: string }) {
  const clamped = Math.min(100, Math.max(0, percent ?? 0));
  return (
    <div className="tile sm">
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

  // Só consulta enquanto a página está aberta.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = () => void ipc.systemStats().then((next) => alive && setStats(next));
    read();
    const timer = setInterval(read, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active]);

  const memoryPercent = stats ? (stats.memoryUsed / Math.max(1, stats.memoryTotal)) * 100 : 0;
  const gpuCaption = !stats ? "…" : stats.gpuMemoryUsed !== null ? `${gigabytes(stats.gpuMemoryUsed)} GB de vídeo` : "sem dados da GPU";

  return (
    <div className="bento sy">
      <Ring percent={stats?.cpu ?? 0} label="CPU" caption={stats?.cpuMhz ? gigahertz(stats.cpuMhz) : "processador"} />
      <Ring
        percent={memoryPercent}
        label="Memória"
        caption={stats ? `${gigabytes(stats.memoryUsed)} de ${gigabytes(stats.memoryTotal)} GB` : "…"}
      />
      <Ring percent={stats ? stats.gpu : 0} label="GPU" caption={gpuCaption} />
    </div>
  );
}
