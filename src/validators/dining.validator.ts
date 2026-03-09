import { z } from 'zod';

/**
 * Zod validation schemas for dining options
 * Ensures order creation data meets requirements for each dining type
 */

// US State abbreviation (2 letters)
const StateCodeSchema = z.string().length(2, 'State must be 2-letter code').regex(/^[A-Z]{2}$/, 'State must be uppercase 2-letter code');

// ZIP code (5 or 9 digits with optional hyphen)
const ZipCodeSchema = z.string().regex(/^\d{5}(-\d{4})?$/, 'ZIP code must be 5 or 9 digits (e.g., 12345 or 12345-6789)');

// Delivery information schema
export const DeliveryInfoSchema = z.object({
  address: z.string().min(1, 'Delivery address is required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: StateCodeSchema,
  zip: ZipCodeSchema,
  deliveryNotes: z.string().optional(),
  estimatedDeliveryTime: z.string().datetime().optional(),
});

// Curbside pickup information schema
export const CurbsideInfoSchema = z.object({
  vehicleDescription: z.string().min(1, 'Vehicle description is required for curbside pickup'),
});

// Catering information schema
export const CateringInfoSchema = z.object({
  eventDate: z.string().datetime('Event date must be a valid ISO datetime'),
  eventTime: z.string().min(1, 'Event time is required'),
  headcount: z.number().int().min(1, 'Headcount must be at least 1'),
  eventType: z.string().optional(),
  setupRequired: z.boolean().optional(),
  depositAmount: z.number().nonnegative().optional(),
  depositPaid: z.boolean().optional(),
  specialInstructions: z.string().optional(),
});

// Customer information schema
export const CustomerInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional().default(''),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').optional().default(''),
  email: z.string().email('Valid email is required').optional(),
});

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates customer info if provided, pushing errors to the array
 */
function validateCustomerInfo(customerInfo: unknown, errors: string[]): void {
  const customerResult = CustomerInfoSchema.safeParse(customerInfo);
  if (!customerResult.success) {
    for (const err of customerResult.error.issues) {
      errors.push(`Customer: ${err.path.join('.')}: ${err.message}`);
    }
  }
}

/**
 * Validates a required Zod schema field, pushing formatted errors
 */
function validateRequiredSchema(
  data: unknown,
  schema: z.ZodType,
  label: string,
  missingMessage: string,
  errors: string[],
): void {
  if (!data) {
    errors.push(missingMessage);
    return;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const err of result.error.issues) {
      errors.push(`${label}: ${err.path.join('.')}: ${err.message}`);
    }
  }
}

function validateDeliveryOrder(data: { customerInfo?: unknown; deliveryInfo?: unknown }, errors: string[]): void {
  if (data.customerInfo) {
    validateCustomerInfo(data.customerInfo, errors);
  } else {
    errors.push('Customer information is required for delivery orders');
  }
  validateRequiredSchema(data.deliveryInfo, DeliveryInfoSchema, 'Delivery', 'Delivery address information is required for delivery orders', errors);
}

function validateCurbsideOrder(data: { customerInfo?: unknown; curbsideInfo?: unknown }, errors: string[]): void {
  if (data.customerInfo) {
    validateCustomerInfo(data.customerInfo, errors);
  } else {
    errors.push('Customer information is required for curbside pickup orders');
  }
  validateRequiredSchema(data.curbsideInfo, CurbsideInfoSchema, 'Curbside', 'Vehicle description is required for curbside pickup orders', errors);
}

function validateCateringOrder(data: { customerInfo?: unknown; cateringInfo?: unknown }, errors: string[]): void {
  if (data.customerInfo) {
    validateCustomerInfo(data.customerInfo, errors);
  } else {
    errors.push('Customer information is required for catering orders');
  }
  validateRequiredSchema(data.cateringInfo, CateringInfoSchema, 'Catering', 'Catering event information is required for catering orders', errors);
}

function validateTakeoutOrder(data: { customerInfo?: unknown; orderSource?: string }, errors: string[]): void {
  const isAnonymousSource = data.orderSource === 'kiosk';
  if (data.customerInfo) {
    validateCustomerInfo(data.customerInfo, errors);
  } else if (!isAnonymousSource) {
    errors.push('Customer information is required for takeout orders');
  }
}

function validateDineInOrder(data: { tableId?: string; tableNumber?: string }, errors: string[]): void {
  if (!data.tableId && !data.tableNumber) {
    errors.push('Table ID or table number is required for dine-in orders');
  }
}

/**
 * Validates dining data based on order type and source
 *
 * @param orderType - Type of order (dine-in, takeout, curbside, delivery, catering)
 * @param data - Object containing customerInfo, deliveryInfo, curbsideInfo, cateringInfo, tableId, tableNumber, orderSource
 * @returns ValidationResult with valid flag and error array
 */
export function validateDiningData(
  orderType: string,
  data: {
    customerInfo?: any;
    deliveryInfo?: any;
    curbsideInfo?: any;
    cateringInfo?: any;
    tableId?: string;
    tableNumber?: string;
    orderSource?: string;
  }
): ValidationResult {
  const errors: string[] = [];

  switch (orderType) {
    case 'delivery':
      validateDeliveryOrder(data, errors);
      break;
    case 'curbside':
      validateCurbsideOrder(data, errors);
      break;
    case 'catering':
      validateCateringOrder(data, errors);
      break;
    case 'takeout':
      validateTakeoutOrder(data, errors);
      break;
    case 'dine-in':
      validateDineInOrder(data, errors);
      break;
    default:
      errors.push(`Unknown order type: ${orderType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
