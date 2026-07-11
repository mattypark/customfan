/** Where a thermal reading actually came from — dashboard shows this honestly. */
export type ThermalSource =
  | 'smctemp' // brew-installed SMC reader (best on Apple Silicon)
  | 'osx-cpu-temp' // brew-installed, also reads fans
  | 'battery-proxy' // ioreg AppleSmartBattery temp — coarse but real, no sudo
  | 'sim'; // simulated

export interface ThermalReading {
  cpuTempC: number | null;
  fanRpm: number | null;
  /** 0–100. CPU_Speed_Limit from `pmset -g therm`; 100 = no throttling. */
  cpuSpeedLimit: number | null;
  tempSource: ThermalSource;
  fanSource: ThermalSource;
  readAt: number;
}

export interface ProcessSample {
  pid: number;
  rssKb: number;
  cpuPercent: number;
  etime: string;
  command: string;
  sampledAt: number;
}

export interface ProcessSummary {
  pid: number;
  command: string;
  cpuPercent: number;
  rssMb: number;
  /** How many samples we hold for this PID (leak detection needs history). */
  sampleCount: number;
}
