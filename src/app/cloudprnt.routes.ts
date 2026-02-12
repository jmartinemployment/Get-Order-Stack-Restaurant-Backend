import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Logger } from 'winston';
import type { CloudPrntService } from '../services/cloudprnt.service';

export function createCloudPrntRouter(
  cloudPrntService: CloudPrntService,
  prisma: PrismaClient,
  logger: Logger
): Router {
  const router = Router();

  /**
   * GET /cloudprnt?mac=XX:XX:XX:XX:XX:XX
   * CloudPRNT Polling Endpoint (Star CloudPRNT Protocol)
   * Printer polls this every 3 seconds to check for jobs
   */
  router.get('/cloudprnt', async (req: Request, res: Response) => {
    try {
      const { mac } = req.query;

      if (!mac) {
        res.status(400).json({ error: 'Missing MAC address' });
        return;
      }

      const macAddress = String(mac);

      // Get pending job for this printer
      const job = await cloudPrntService.getPendingJob(macAddress);

      if (job) {
        // Job ready
        res.json({
          jobReady: true,
          mediaTypes: ['application/vnd.star.starprnt'],
        });
      } else {
        // No job ready
        res.json({
          statusCode: 200,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('[CloudPRNT Poll] Error', { error: message });
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /cloudprnt/job/:mac
   * CloudPRNT Job Download Endpoint
   * Printer fetches binary receipt data
   */
  router.get('/cloudprnt/job/:mac', async (req: Request, res: Response) => {
    try {
      const { mac } = req.params;

      // Find printer
      const printer = await prisma.printer.findUnique({
        where: { macAddress: mac },
      });

      if (!printer) {
        res.status(404).json({ error: 'Printer not found' });
        return;
      }

      // Find job with status 'printing' (set by getPendingJob)
      const job = await prisma.printJob.findFirst({
        where: {
          printerId: printer.id,
          status: 'printing',
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!job) {
        res.status(404).json({ error: 'No print job found' });
        return;
      }

      // Generate receipt binary data
      const receiptBuffer = await cloudPrntService.generateJobData(job, printer);

      // Return binary data with CloudPRNT headers
      res.set('Content-Type', 'application/vnd.star.starprnt');
      res.set('Content-Length', receiptBuffer.length.toString());
      res.set('X-Star-Printer-JobId', job.id);
      res.send(receiptBuffer);

      logger.info('[CloudPRNT] Job downloaded', {
        jobId: job.id,
        printerId: printer.id,
        mac,
        sizeBytes: receiptBuffer.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('[CloudPRNT Job Download] Error', { error: message });
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /cloudprnt/job/:jobId
   * CloudPRNT Job Completion Endpoint
   * Printer confirms successful print
   */
  router.delete('/cloudprnt/job/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      await cloudPrntService.markJobCompleted(jobId);

      res.json({ success: true });

      logger.info('[CloudPRNT] Job completed', { jobId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('[CloudPRNT Job Completion] Error', { error: message });
      res.status(500).json({ error: message });
    }
  });

  return router;
}
