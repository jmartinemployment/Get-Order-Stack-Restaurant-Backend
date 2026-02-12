import { PrismaClient } from '@prisma/client';
import type { Logger } from 'winston';
import { MAC_ADDRESS_REGEX, PRINTER_MODELS } from '../utils/constants';
import type {
  CreatePrinterDto,
  UpdatePrinterDto,
  PrinterResponseDto,
  CloudPrntConfigDto,
} from '../models/printer.dto';

export class PrinterService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    private readonly baseUrl: string
  ) {}

  /**
   * Find all printers for a restaurant
   */
  async findAll(restaurantId: string): Promise<any[]> {
    const printers = await this.prisma.printer.findMany({
      where: { restaurantId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    this.logger.info('Fetched printers for restaurant', {
      restaurantId,
      count: printers.length,
    });

    return printers;
  }

  /**
   * Create a new printer
   */
  async create(
    restaurantId: string,
    data: CreatePrinterDto
  ): Promise<PrinterResponseDto> {
    this.logger.info('Creating printer', { restaurantId, data });

    // Validate MAC address
    if (!MAC_ADDRESS_REGEX.exec(data.macAddress)) {
      throw new Error('Invalid MAC address format. Expected: XX:XX:XX:XX:XX:XX');
    }

    // Normalize MAC address to uppercase
    const macAddress = data.macAddress.toUpperCase();

    // Validate printer model
    if (!PRINTER_MODELS[data.model]) {
      throw new Error(`Invalid printer model: ${data.model}`);
    }

    // Get default print width from model if not specified
    const printWidth = data.printWidth ?? PRINTER_MODELS[data.model].printWidth;

    // Atomic: Unset previous default if setting this as default
    if (data.isDefault) {
      await this.prisma.printer.updateMany({
        where: {
          restaurantId,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      this.logger.info('Unset previous default printer', { restaurantId });
    }

    // Create printer
    const printer = await this.prisma.printer.create({
      data: {
        restaurantId,
        name: data.name,
        model: data.model,
        macAddress,
        ipAddress: data.ipAddress ?? null,
        printWidth,
        isDefault: data.isDefault ?? false,
        isActive: true,
      },
    });

    this.logger.info('Printer created', {
      printerId: printer.id,
      restaurantId,
      name: printer.name,
      macAddress,
    });

    // Generate CloudPRNT configuration
    const cloudPrntConfig: CloudPrntConfigDto = {
      serverUrl: `${this.baseUrl}/cloudprnt?mac=${macAddress}`,
      instructions: [
        '1. Access your Star printer web UI (find IP via printer network config)',
        '2. Navigate to CloudPRNT settings',
        '3. Enable CloudPRNT and paste the Server URL above',
        '4. Set polling interval to 3 seconds',
        '5. Save and reboot printer',
        '6. Printer will appear online when first poll is received',
      ].join('\n'),
    };

    return {
      printer,
      cloudPrntConfig,
    };
  }

  /**
   * Update a printer
   */
  async update(
    printerId: string,
    data: UpdatePrinterDto
  ): Promise<any> {
    this.logger.info('Updating printer', { printerId, data });

    const printer = await this.prisma.printer.findUnique({
      where: { id: printerId },
    });

    if (!printer) {
      throw new Error(`Printer not found: ${printerId}`);
    }

    // Atomic: Unset previous default if setting this as default
    if (data.isDefault) {
      await this.prisma.printer.updateMany({
        where: {
          restaurantId: printer.restaurantId,
          isDefault: true,
          id: { not: printerId },
        },
        data: { isDefault: false },
      });

      this.logger.info('Unset previous default printer', {
        restaurantId: printer.restaurantId,
      });
    }

    // Update printer
    const updated = await this.prisma.printer.update({
      where: { id: printerId },
      data,
    });

    this.logger.info('Printer updated', {
      printerId,
      changes: Object.keys(data),
    });

    return updated;
  }

  /**
   * Delete a printer
   */
  async delete(printerId: string): Promise<void> {
    this.logger.info('Deleting printer', { printerId });

    const printer = await this.prisma.printer.findUnique({
      where: { id: printerId },
    });

    if (!printer) {
      throw new Error(`Printer not found: ${printerId}`);
    }

    // Delete printer (cascade deletes print jobs)
    await this.prisma.printer.delete({
      where: { id: printerId },
    });

    this.logger.info('Printer deleted', {
      printerId,
      name: printer.name,
    });
  }
}
