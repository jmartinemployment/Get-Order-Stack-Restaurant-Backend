/**
 * Star Line Mode ESC/POS Command Generator
 * Generates thermal receipt printer commands for Star CloudPRNT printers
 */

// ESC/POS Commands
const ESC = 0x1B;
const LF = 0x0A;

/**
 * Star Line Mode command builder for thermal receipt printing
 */
export class StarLineMode {
  private buffer: number[] = [];

  /**
   * Initialize printer (ESC @)
   */
  init(): this {
    this.buffer.push(ESC, 0x40);
    return this;
  }

  /**
   * Set bold text (ESC E n)
   */
  setBold(enabled: boolean): this {
    this.buffer.push(ESC, 0x45, enabled ? 1 : 0);
    return this;
  }

  /**
   * Set text alignment (ESC a n)
   * @param alignment 0=left, 1=center, 2=right
   */
  setAlignment(alignment: 0 | 1 | 2): this {
    this.buffer.push(ESC, 0x61, alignment);
    return this;
  }

  /**
   * Print UTF-8 text
   */
  text(str: string): this {
    const bytes = Buffer.from(str, 'utf-8');
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  /**
   * Print text with newline
   */
  textLine(str: string): this {
    return this.text(str).newline();
  }

  /**
   * Print justified line with left and right text
   * @param left Left-aligned text
   * @param right Right-aligned text
   * @param width Total width in characters
   */
  paddedLine(left: string, right: string, width: number): this {
    const leftLen = left.length;
    const rightLen = right.length;
    const spaces = width - leftLen - rightLen;

    if (spaces < 1) {
      // Not enough space, truncate left side
      const truncatedLeft = left.slice(0, width - rightLen - 3) + '...';
      return this.text(truncatedLeft).textLine(right);
    }

    return this.text(left).text(' '.repeat(spaces)).textLine(right);
  }

  /**
   * Print divider line
   */
  divider(char: string = '=', width: number = 48): this {
    return this.textLine(char.repeat(width));
  }

  /**
   * Add line feeds
   */
  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  /**
   * Partial cut (ESC d 3)
   */
  cut(): this {
    this.buffer.push(ESC, 0x64, 3);
    return this;
  }

  /**
   * Build final buffer
   */
  build(): Buffer {
    return Buffer.from(this.buffer);
  }
}

/**
 * Helper: Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Helper: Format currency
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Helper: Format date/time
 */
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

/**
 * Generate receipt for an order
 */
export function generateReceipt(order: any, printer: any, restaurantName: string): Buffer {
  const slm = new StarLineMode();
  const width = printer.printWidth ?? 48;

  // Initialize
  slm.init();

  // Header - Restaurant Name (centered, bold)
  slm.divider('=', width);
  slm.setBold(true).setAlignment(1);
  slm.textLine(restaurantName.toUpperCase());
  slm.setBold(false).setAlignment(0);
  slm.divider('=', width);

  // Order info
  const orderType = order.orderType ?? 'Dine-In';
  slm.paddedLine(`Order #${order.orderNumber}`, orderType, width);
  slm.textLine(formatDateTime(order.createdAt));

  // Table/Customer info
  if (order.table?.tableNumber) {
    slm.textLine(`Table: ${order.table.tableNumber}`);
  }
  if (order.customer) {
    const customerName = order.customer.firstName && order.customer.lastName
      ? `${order.customer.firstName} ${order.customer.lastName}`
      : order.customer.firstName ?? order.customer.lastName ?? 'Guest';
    slm.textLine(`Customer: ${customerName}`);
  }

  slm.divider('=', width);
  slm.newline();

  // Order items
  if (order.orderItems && order.orderItems.length > 0) {
    for (const item of order.orderItems) {
      // Quantity and item name
      const qtyStr = `  ${item.quantity}x  `;
      const itemName = truncate(item.menuItemName, width - qtyStr.length - 10);
      const itemPrice = formatCurrency(item.totalPrice);

      slm.paddedLine(qtyStr + itemName, itemPrice, width);

      // Modifiers
      if (item.modifiers && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          const modText = `        + ${truncate(mod.modifierName, width - 20)}`;
          const modPrice = formatCurrency(mod.priceAdjustment);
          slm.paddedLine(modText, modPrice, width);
        }
      }

      // Special instructions
      if (item.specialInstructions) {
        slm.text('      Note: ').textLine(truncate(item.specialInstructions, width - 12));
      }

      slm.newline();
    }
  }

  // Totals
  slm.divider('=', width);
  slm.paddedLine('Subtotal', formatCurrency(Number.parseFloat(order.subtotal.toString())), width);
  slm.paddedLine(`Tax (${(order.restaurant?.taxRate ?? 0.0825) * 100}%)`, formatCurrency(Number.parseFloat(order.tax.toString())), width);

  if (order.tip && Number.parseFloat(order.tip.toString()) > 0) {
    slm.paddedLine('Tip', formatCurrency(Number.parseFloat(order.tip.toString())), width);
  }

  if (order.deliveryFee && Number.parseFloat(order.deliveryFee.toString()) > 0) {
    slm.paddedLine('Delivery Fee', formatCurrency(Number.parseFloat(order.deliveryFee.toString())), width);
  }

  if (order.discount && Number.parseFloat(order.discount.toString()) > 0) {
    slm.paddedLine('Discount', `-${formatCurrency(Number.parseFloat(order.discount.toString()))}`, width);
  }

  slm.divider('=', width);
  slm.setBold(true);
  slm.paddedLine('TOTAL', formatCurrency(Number.parseFloat(order.total.toString())), width);
  slm.setBold(false);
  slm.divider('=', width);

  // Payment method
  if (order.paymentMethod) {
    slm.newline();
    slm.textLine(`Payment: ${order.paymentMethod}`);
  }

  // Special instructions
  if (order.specialInstructions) {
    slm.newline();
    slm.textLine('Order Notes:');
    slm.textLine(truncate(order.specialInstructions, width));
  }

  // Footer
  slm.newline(2);
  slm.setAlignment(1);
  slm.textLine('Thank you for your order!');
  slm.textLine('Powered by GetOrderStack');
  slm.setAlignment(0);
  slm.newline();
  slm.divider('=', width);
  slm.newline(3);

  // Cut paper
  slm.cut();

  return slm.build();
}

/**
 * Generate test receipt
 */
export function generateTestReceipt(printer: any, restaurantName: string): Buffer {
  const slm = new StarLineMode();
  const width = printer.printWidth ?? 48;

  slm.init();

  // Header
  slm.divider('=', width);
  slm.setBold(true).setAlignment(1);
  slm.textLine('TEST PRINT');
  slm.setBold(false).setAlignment(0);
  slm.divider('=', width);

  // Printer info
  slm.newline();
  slm.textLine(`Restaurant: ${restaurantName}`);
  slm.textLine(`Printer: ${printer.name}`);
  slm.textLine(`Model: ${printer.model}`);
  slm.textLine(`MAC: ${printer.macAddress}`);
  if (printer.ipAddress) {
    slm.textLine(`IP: ${printer.ipAddress}`);
  }
  slm.textLine(`Print Width: ${width} chars`);
  slm.textLine(`Date: ${formatDateTime(new Date())}`);

  slm.newline();
  slm.divider('-', width);
  slm.newline();

  // Sample content
  slm.setAlignment(1);
  slm.textLine('PRINTER IS ONLINE');
  slm.textLine('AND WORKING CORRECTLY');
  slm.setAlignment(0);

  slm.newline();
  slm.divider('=', width);
  slm.newline();

  slm.setAlignment(1);
  slm.textLine('Powered by GetOrderStack');
  slm.setAlignment(0);

  slm.newline(3);
  slm.cut();

  return slm.build();
}
