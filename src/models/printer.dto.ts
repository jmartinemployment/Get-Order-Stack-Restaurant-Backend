export type PrinterModel = 'Star mC-Print3' | 'Star mC-Print2' | 'Star TSP654II' | 'Star TSP743II';
export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed';

export interface CreatePrinterDto {
  name: string;
  model: PrinterModel;
  macAddress: string;
  ipAddress?: string;
  printWidth?: number;
  isDefault?: boolean;
}

export interface UpdatePrinterDto {
  name?: string;
  ipAddress?: string;
  printWidth?: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CloudPrntConfigDto {
  serverUrl: string;
  instructions: string;
}

export interface PrinterResponseDto {
  printer: any;  // Prisma Printer type
  cloudPrntConfig: CloudPrntConfigDto;
}

export interface TestPrintResponseDto {
  success: boolean;
  jobId: string;
}

export interface CloudPrntPollResponseDto {
  statusCode?: number;
  jobReady?: boolean;
  mediaTypes?: string[];
}
