import { Router, type Request, type Response } from 'express';
import { printerService } from '../services/printer.service';
import { cloudPrntService } from '../services/cloudprnt.service';

const router = Router({ mergeParams: true });

/**
 * GET /restaurant/:merchantId/printers
 * List all printers for a restaurant
 */
router.get('/:merchantId/printers', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const printers = await printerService.findAll(restaurantId);
    res.json(printers);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list printers';
    console.error('[PrinterRoutes] Error listing printers', { error: message });
    res.status(500).json({ error: message });
  }
});

/**
 * POST /restaurant/:merchantId/printers
 * Register a new printer
 */
router.post('/:merchantId/printers', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, model, macAddress, ipAddress, printWidth, isDefault } = req.body;

    if (!name || !model || !macAddress) {
      res.status(400).json({ error: 'Missing required fields: name, model, macAddress' });
      return;
    }

    const result = await printerService.create(restaurantId, {
      name,
      model,
      macAddress,
      ipAddress,
      printWidth,
      isDefault,
    });

    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to register printer';
    console.error('[PrinterRoutes] Error registering printer', { error: message });
    res.status(400).json({ error: message });
  }
});

/**
 * PATCH /restaurant/:merchantId/printers/:printerId
 * Update a printer
 */
router.patch('/:merchantId/printers/:printerId', async (req: Request, res: Response) => {
  try {
    const { printerId } = req.params;
    const { name, ipAddress, printWidth, isDefault, isActive } = req.body;

    const printer = await printerService.update(printerId, {
      name,
      ipAddress,
      printWidth,
      isDefault,
      isActive,
    });

    res.json(printer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update printer';
    console.error('[PrinterRoutes] Error updating printer', { error: message });
    res.status(400).json({ error: message });
  }
});

/**
 * DELETE /restaurant/:merchantId/printers/:printerId
 * Delete a printer
 */
router.delete('/:merchantId/printers/:printerId', async (req: Request, res: Response) => {
  try {
    const { printerId } = req.params;
    await printerService.delete(printerId);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete printer';
    console.error('[PrinterRoutes] Error deleting printer', { error: message });
    res.status(400).json({ error: message });
  }
});

/**
 * POST /restaurant/:merchantId/printers/:printerId/test
 * Test print a printer
 */
router.post('/:merchantId/printers/:printerId/test', async (req: Request, res: Response) => {
  try {
    const { printerId } = req.params;
    const jobId = await cloudPrntService.queueTestPrint(printerId);
    res.json({ success: true, jobId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create test print';
    console.error('[PrinterRoutes] Error creating test print', { error: message });
    res.status(400).json({ error: message });
  }
});

export default router;
