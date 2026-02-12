export const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

export const PRINTER_MODELS: Record<string, { name: string; printWidth: number }> = {
  'Star mC-Print3': { name: 'Star mC-Print3', printWidth: 48 },
  'Star mC-Print2': { name: 'Star mC-Print2', printWidth: 42 },
  'Star TSP654II': { name: 'Star TSP654II', printWidth: 48 },
  'Star TSP743II': { name: 'Star TSP743II', printWidth: 69 },
};

export const PRINT_JOB_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes
export const CLOUDPRNT_POLL_INTERVAL_MS = 3000;  // 3 seconds (recommended by Star)
