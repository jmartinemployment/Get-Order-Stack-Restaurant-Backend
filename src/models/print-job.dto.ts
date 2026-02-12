export interface CreatePrintJobDto {
  orderId: string;
  printerId: string;
  jobData: any;  // Order data snapshot
}

export interface PrintJobDto {
  id: string;
  orderId: string;
  printerId: string;
  status: string;
  attemptCount: number;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}
