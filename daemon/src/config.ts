export const DAEMON_PORT = Number(process.env.PORT ?? 4310);

/** SIM=1 forces simulated sensors everywhere (no hardware, no sudo needed). */
export const SIM_MODE = process.env.SIM === '1';

export const APP_NAME = 'customfan';
export const APP_VERSION = '0.1.0';
