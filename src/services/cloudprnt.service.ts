import { PrismaClient } from '@prisma/client';
import type { Logger } from 'winston';
import { generateReceipt, generateTestReceipt } from '../utils/star-line-mode';
import { PRINT_JOB_TIMEOUT_MS } from '../utils/constants';
import type { CreatePrintJobDto } from '../models/print-job.dto';

export class CloudPrntService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    private readonly socketService: any  // SocketService type
  ) {}

  /**
   * Queue a print job when order is marked ready
   */
  async queuePrintJob(orderId: string, printerId?: string): Promise<string> {
    this.logger.info('Queuing print job for order', { orderId, printerId });

    // Fetch order with all related data
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: true,
        customer: true,
        table: true,
        orderItems: {
          include: {
            menuItem: true,
            modifiers: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Find printer (specified, default, or any active)
    const printer = await this.findPrinterForRestaurant(
      order.restaurantId,
      printerId
    );

    if (!printer) {
      throw new Error(`No active printers found for restaurant ${order.restaurantId}`);
    }

    // Create print job with cached order data
    const printJob = await this.prisma.printJob.create({
      data: {
        orderId,
        printerId: printer.id,
        status: 'pending',
        jobData: order as any,  // Cache full order snapshot
        attemptCount: 0,
      },
    });

    this.logger.info('Print job queued', {
      jobId: printJob.id,
      orderId,
      printerId: printer.id,
      printerName: printer.name,
    });

    return printJob.id;
  }

  /**
   * Queue a test print job
   */
  async queueTestPrint(printerId: string): Promise<string> {
    this.logger.info('Queuing test print job', { printerId });

    const printer = await this.prisma.printer.findUnique({
      where: { id: printerId },
      include: { restaurant: true },
    });

    if (!printer) {
      throw new Error(`Printer not found: ${printerId}`);
    }

    // Create a dummy order for test print
    const testOrder = {
      id: 'test-print',
      orderNumber: 'TEST',
      restaurantId: printer.restaurantId,
      restaurant: printer.restaurant,
      orderType: 'Test Print',
      createdAt: new Date(),
      subtotal: 0,
      tax: 0,
      total: 0,
      orderItems: [],
      _isTestPrint: true,  // Flag to identify test print
    };

    const printJob = await this.prisma.printJob.create({
      data: {
        orderId: 'test-print-' + Date.now(),  // Unique ID for test
        printerId: printer.id,
        status: 'pending',
        jobData: testOrder as any,
        attemptCount: 0,
      },
    });

    this.logger.info('Test print job queued', {
      jobId: printJob.id,
      printerId,
      printerName: printer.name,
    });

    return printJob.id;
  }

  /**
   * Get pending job for printer (CloudPRNT polling endpoint)
   */
  async getPendingJob(macAddress: string): Promise<any | null> {
    // Update last poll time
    await this.prisma.printer.updateMany({
      where: { macAddress },
      data: { lastPollAt: new Date() },
    });

    // Find printer
    const printer = await this.prisma.printer.findUnique({
      where: { macAddress },
    });

    if (!printer) {
      this.logger.warn('Unknown printer MAC address polling', { macAddress });
      return null;
    }

    // Find oldest pending job for this printer
    const job = await this.prisma.printJob.findFirst({
      where: {
        printerId: printer.id,
        status: 'pending',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!job) {
      return null;
    }

    // Mark job as printing and increment attempt count
    await this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: 'printing',
        attemptCount: { increment: 1 },
      },
    });

    this.logger.info('Print job picked up by printer', {
      jobId: job.id,
      printerId: printer.id,
      printerName: printer.name,
      macAddress,
      attemptCount: job.attemptCount + 1,
    });

    return job;
  }

  /**
   * Generate Star Line Mode receipt data
   */
  async generateJobData(job: any, printer: any): Promise<Buffer> {
    const order = job.jobData;
    const restaurantName = order.restaurant?.name ?? 'Restaurant';

    // Check if test print
    if (order._isTestPrint) {
      return generateTestReceipt(printer, restaurantName);
    }

    return generateReceipt(order, printer, restaurantName);
  }

  /**
   * Mark job as completed (printer confirms success)
   */
  async markJobCompleted(jobId: string): Promise<void> {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        order: {
          include: { restaurant: true },
        },
      },
    });

    if (!job) {
      this.logger.warn('Job not found for completion', { jobId });
      return;
    }

    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    this.logger.info('Print job completed', {
      jobId,
      orderId: job.orderId,
      attemptCount: job.attemptCount,
    });

    // Emit WebSocket event to frontend
    if (job.order?.restaurantId && this.socketService.emitToPrinter) {
      this.socketService.emitToPrinter(
        job.order.restaurantId,
        'order:printed',
        {
          orderId: job.orderId,
          printerId: job.printerId,
          jobId,
        }
      );
    }
  }

  /**
   * Mark job as failed
   */
  async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        order: {
          include: { restaurant: true },
        },
      },
    });

    if (!job) {
      this.logger.warn('Job not found for failure', { jobId });
      return;
    }

    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    });

    this.logger.error('Print job failed', {
      jobId,
      orderId: job.orderId,
      attemptCount: job.attemptCount,
      error: errorMessage,
    });

    // Emit WebSocket event to frontend
    if (job.order?.restaurantId && this.socketService.emitToPrinter) {
      this.socketService.emitToPrinter(
        job.order.restaurantId,
        'order:print_failed',
        {
          orderId: job.orderId,
          printerId: job.printerId,
          jobId,
          error: errorMessage,
        }
      );
    }
  }

  /**
   * Cleanup stale print jobs (background job runs every 1 min)
   */
  async cleanupStaleJobs(): Promise<number> {
    const cutoffTime = new Date(Date.now() - PRINT_JOB_TIMEOUT_MS);

    // Find jobs that have been "printing" for more than 5 minutes
    const staleJobs = await this.prisma.printJob.findMany({
      where: {
        status: 'printing',
        createdAt: {
          lt: cutoffTime,
        },
      },
      include: {
        order: {
          include: { restaurant: true },
        },
      },
    });

    if (staleJobs.length === 0) {
      return 0;
    }

    this.logger.info('Cleaning up stale print jobs', {
      count: staleJobs.length,
      cutoffTime,
    });

    for (const job of staleJobs) {
      await this.markJobFailed(job.id, 'Print job timeout (5 minutes)');
    }

    return staleJobs.length;
  }

  /**
   * Find printer for restaurant (default > active > error)
   */
  private async findPrinterForRestaurant(
    restaurantId: string,
    printerId?: string
  ): Promise<any | null> {
    // 1. If printerId specified, use that printer
    if (printerId) {
      const printer = await this.prisma.printer.findFirst({
        where: {
          id: printerId,
          restaurantId,
          isActive: true,
        },
      });
      return printer;
    }

    // 2. Find default printer for restaurant
    const defaultPrinter = await this.prisma.printer.findFirst({
      where: {
        restaurantId,
        isDefault: true,
        isActive: true,
      },
    });

    if (defaultPrinter) {
      return defaultPrinter;
    }

    // 3. Find any active printer for restaurant
    const anyPrinter = await this.prisma.printer.findFirst({
      where: {
        restaurantId,
        isActive: true,
      },
    });

    return anyPrinter;
  }
}
