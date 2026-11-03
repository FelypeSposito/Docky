//! Monitor de sistema: CPU, memória e GPU. O frontend pergunta enquanto a página está aberta;
//! nada roda em segundo plano quando ninguém está olhando.

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, System};
use tauri::State;

pub struct SystemState {
    system: Mutex<System>,
    gpu: Mutex<gpu::Gpu>,
}

impl SystemState {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_specifics(CpuRefreshKind::everything());
        Self { system: Mutex::new(system), gpu: Mutex::new(gpu::Gpu::new()) }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    /// 0 a 100
    pub cpu: f32,
    /// Frequência atual do processador, em MHz.
    pub cpu_mhz: u64,
    pub memory_used: u64,
    pub memory_total: u64,
    /// Uso da GPU em % (0 a 100), ou `None` se o Windows não expõe o contador.
    pub gpu: Option<f32>,
    /// Memória dedicada da GPU em uso, em bytes.
    pub gpu_memory_used: Option<u64>,
}

#[tauri::command]
pub fn system_stats(state: State<SystemState>) -> Stats {
    let (cpu, cpu_mhz, memory_used, memory_total) = {
        let mut system = state.system.lock().unwrap();
        system.refresh_cpu_specifics(CpuRefreshKind::nothing().with_cpu_usage().with_frequency());
        system.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
        let mhz = system.cpus().first().map(|c| c.frequency()).unwrap_or(0);
        (system.global_cpu_usage(), mhz, system.used_memory(), system.total_memory())
    };
    let mut counters = state.gpu.lock().unwrap();
    let (gpu, gpu_memory_used) = counters.read();
    // Os mesmos contadores do Gerenciador de Tarefas: uso (que pode passar de 100 com turbo, e ele limita) e
    // velocidade atual. O `sysinfo` só sabe a frequência base e o uso por tempo ocupado, que dão outro número.
    let (task_manager_cpu, task_manager_mhz) = counters.cpu();
    Stats {
        cpu: task_manager_cpu.unwrap_or(cpu),
        cpu_mhz: task_manager_mhz.unwrap_or(cpu_mhz),
        memory_used,
        memory_total,
        gpu,
        gpu_memory_used,
    }
}

/// A velocidade atual do processador: a frequência base vezes o desempenho (100% = base; o turbo passa disso).
pub fn current_mhz(base_mhz: f64, performance_percent: f64) -> u64 {
    (base_mhz * performance_percent / 100.0).max(0.0).round() as u64
}

/// Soma os valores por tipo de engine ("engtype_3D", "engtype_VideoDecode"…) e fica com o maior,
/// que é o que o Gerenciador de Tarefas mostra como uso da GPU.
pub fn busiest_engine(instances: &[(String, f64)]) -> f64 {
    let mut totals: Vec<(&str, f64)> = Vec::new();
    for (name, value) in instances {
        let kind = name.rsplit("engtype_").next().unwrap_or("");
        match totals.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, total)) => *total += value,
            None => totals.push((kind, *value)),
        }
    }
    totals.iter().map(|(_, t)| *t).fold(0.0, f64::max).min(100.0)
}

#[cfg(windows)]
mod gpu {
    //! Contadores de desempenho do Windows (PDH): os mesmos que o Gerenciador de Tarefas usa para a GPU.

    use windows::{
        Win32::System::Performance::{
            PDH_FMT_COUNTERVALUE, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY, PdhAddEnglishCounterW,
            PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhGetFormattedCounterValue, PdhOpenQueryW,
        },
        core::PCWSTR,
    };

    const MORE_DATA: u32 = 0x800007D2;

    /// Os identificadores do PDH são ponteiros; guardados como números para a estrutura poder ir entre threads
    /// (cada acesso passa pelo Mutex do estado, então só uma thread usa por vez).
    pub struct Gpu {
        query: usize,
        usage: Option<usize>,
        memory: Option<usize>,
        /// "% Processor Utility", "% Processor Performance" e "Processor Frequency" (MHz base).
        cpu_utility: Option<usize>,
        cpu_performance: Option<usize>,
        cpu_base_mhz: Option<usize>,
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn handle_query(value: usize) -> PDH_HQUERY {
        PDH_HQUERY(value as *mut _)
    }

    impl Gpu {
        pub fn new() -> Self {
            let mut query = PDH_HQUERY::default();
            if unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) } != 0 {
                return Self { query: 0, usage: None, memory: None, cpu_utility: None, cpu_performance: None, cpu_base_mhz: None };
            }
            let add = |path: &str| {
                let mut counter = PDH_HCOUNTER::default();
                let path = wide(path);
                (unsafe { PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter) } == 0).then_some(counter.0 as usize)
            };
            let usage = add(r"\GPU Engine(*)\Utilization Percentage");
            let memory = add(r"\GPU Adapter Memory(*)\Dedicated Usage");
            let cpu_utility = add(r"\Processor Information(_Total)\% Processor Utility");
            let cpu_performance = add(r"\Processor Information(_Total)\% Processor Performance");
            let cpu_base_mhz = add(r"\Processor Information(_Total)\Processor Frequency");
            unsafe { PdhCollectQueryData(query) };
            Self { query: query.0 as usize, usage, memory, cpu_utility, cpu_performance, cpu_base_mhz }
        }

        /// Valores de um contador com curinga: (nome da instância, valor).
        fn instances(counter: usize) -> Vec<(String, f64)> {
            let counter = PDH_HCOUNTER(counter as *mut _);
            let (mut bytes, mut count) = (0u32, 0u32);
            let status = unsafe { PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut bytes, &mut count, None) };
            if status != MORE_DATA || bytes == 0 {
                return Vec::new();
            }
            // u64 garante o alinhamento que a estrutura exige.
            let mut buffer = vec![0u64; (bytes as usize).div_ceil(8)];
            let items = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            let status = unsafe { PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut bytes, &mut count, Some(items)) };
            if status != 0 {
                return Vec::new();
            }
            (0..count as usize)
                .filter_map(|i| unsafe {
                    let item = &*items.add(i);
                    let name = item.szName.to_string().ok()?;
                    (item.FmtValue.CStatus == 0).then(|| (name, item.FmtValue.Anonymous.doubleValue))
                })
                .collect()
        }

        /// Valor de um contador simples (sem curinga), se o Windows já tem duas amostras para calculá-lo.
        fn single(counter: Option<usize>) -> Option<f64> {
            let counter = PDH_HCOUNTER(counter? as *mut _);
            let mut value = PDH_FMT_COUNTERVALUE::default();
            let status = unsafe { PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, None, &mut value) };
            (status == 0 && value.CStatus == 0).then(|| unsafe { value.Anonymous.doubleValue })
        }

        /// Uso e velocidade do processador como o Gerenciador de Tarefas mostra (usa a leitura feita em `read`).
        pub fn cpu(&mut self) -> (Option<f32>, Option<u64>) {
            if self.query == 0 {
                return (None, None);
            }
            let usage = Self::single(self.cpu_utility).map(|v| v.clamp(0.0, 100.0) as f32);
            let mhz = Self::single(self.cpu_base_mhz)
                .zip(Self::single(self.cpu_performance))
                .map(|(base, performance)| super::current_mhz(base, performance));
            (usage, mhz)
        }

        pub fn read(&mut self) -> (Option<f32>, Option<u64>) {
            if self.query == 0 {
                return (None, None);
            }
            unsafe { PdhCollectQueryData(handle_query(self.query)) };
            let usage = self.usage.map(Self::instances).filter(|v| !v.is_empty()).map(|v| super::busiest_engine(&v) as f32);
            let memory = self
                .memory
                .map(Self::instances)
                .filter(|v| !v.is_empty())
                .map(|v| v.iter().map(|(_, bytes)| *bytes).sum::<f64>() as u64);
            (usage, memory)
        }
    }
}

#[cfg(not(windows))]
mod gpu {
    pub struct Gpu;
    impl Gpu {
        pub fn new() -> Self {
            Self
        }
        pub fn read(&mut self) -> (Option<f32>, Option<u64>) {
            (None, None)
        }
        pub fn cpu(&mut self) -> (Option<f32>, Option<u64>) {
            (None, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{busiest_engine, current_mhz};

    #[test]
    fn velocidade_atual_e_a_base_vezes_o_desempenho() {
        assert_eq!(current_mhz(3600.0, 127.8), 4601); // 4,60 GHz, como no Gerenciador de Tarefas
        assert_eq!(current_mhz(3600.0, 100.0), 3600);
        assert_eq!(current_mhz(3600.0, 0.0), 0);
    }

    fn inst(name: &str, value: f64) -> (String, f64) {
        (name.to_string(), value)
    }

    #[test]
    fn soma_por_tipo_e_fica_com_o_maior() {
        let instances = vec![
            inst("pid_1_luid_0x0_phys_0_eng_0_engtype_3D", 30.0),
            inst("pid_2_luid_0x0_phys_0_eng_0_engtype_3D", 25.0),
            inst("pid_2_luid_0x0_phys_0_eng_3_engtype_VideoDecode", 10.0),
        ];
        assert_eq!(busiest_engine(&instances), 55.0);
    }

    /// Teste de fumaça na máquina real: os contadores abrem e, se houver GPU, o valor é plausível.
    #[cfg(windows)]
    #[test]
    fn le_a_gpu_desta_maquina() {
        let mut gpu = super::gpu::Gpu::new();
        gpu.read();
        std::thread::sleep(std::time::Duration::from_millis(600));
        let (usage, memory) = gpu.read();
        println!("GPU: uso={usage:?} memória={memory:?}");
        if let Some(usage) = usage {
            assert!((0.0..=100.0).contains(&usage));
        }
    }

    #[test]
    fn nunca_passa_de_100_nem_quebra_sem_dados() {
        assert_eq!(busiest_engine(&[inst("x_engtype_3D", 80.0), inst("y_engtype_3D", 70.0)]), 100.0);
        assert_eq!(busiest_engine(&[]), 0.0);
    }
}

#[cfg(all(test, windows))]
mod cpu_smoke {
    /// Teste de fumaça na máquina real: os contadores do processador abrem e dão números plausíveis.
    #[test]
    fn le_o_processador_desta_maquina() {
        let mut counters = super::gpu::Gpu::new();
        counters.read();
        std::thread::sleep(std::time::Duration::from_millis(900));
        counters.read();
        let (usage, mhz) = counters.cpu();
        println!("CPU: uso={usage:?} mhz={mhz:?}");
        if let Some(usage) = usage {
            assert!((0.0..=100.0).contains(&usage));
        }
        if let Some(mhz) = mhz {
            assert!((400..=7000).contains(&mhz));
        }
    }
}
