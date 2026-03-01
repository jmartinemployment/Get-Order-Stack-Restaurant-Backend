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
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
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
    customerResult.error.issues.forEach(err => {
      errors.push(`Customer: ${err.path.join('.')}: ${err.message}`);
    });
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
  const anonymousSources = new Set(['kiosk', 'register', 'bar']);
  const isAnonymousSource = anonymousSources.has(data.orderSource ?? '');

  switch (orderType) {
    case 'delivery':
      // Delivery always requires customer info AND delivery address
      if (!data.customerInfo) {
        errors.push('Customer information is required for delivery orders');
      } else {
        validateCustomerInfo(data.customerInfo, errors);
      }

      if (!data.deliveryInfo) {
        errors.push('Delivery address information is required for delivery orders');
      } else {
        const deliveryResult = DeliveryInfoSchema.safeParse(data.deliveryInfo);
        if (!deliveryResult.success) {
          deliveryResult.error.issues.forEach(err => {
            errors.push(`Delivery: ${err.path.join('.')}: ${err.message}`);
          });
        }
      }
      break;

    case 'curbside':
      // Curbside requires customer info AND vehicle description
      if (!data.customerInfo) {
        errors.push('Customer information is required for curbside pickup orders');
      } else {
        validateCustomerInfo(data.customerInfo, errors);
      }

      if (!data.curbsideInfo) {
        errors.push('Vehicle description is required for curbside pickup orders');
      } else {
        const curbsideResult = CurbsideInfoSchema.safeParse(data.curbsideInfo);
        if (!curbsideResult.success) {
          curbsideResult.error.issues.forEach(err => {
            errors.push(`Curbside: ${err.path.join('.')}: ${err.message}`);
          });
        }
      }
      break;

    case 'catering':
      // Catering always requires customer info AND event details
      if (!data.customerInfo) {
        errors.push('Customer information is required for catering orders');
      } else {
        validateCustomerInfo(data.customerInfo, errors);
      }

      if (!data.cateringInfo) {
        errors.push('Catering event information is required for catering orders');
      } else {
        const cateringResult = CateringInfoSchema.safeParse(data.cateringInfo);
        if (!cateringResult.success) {
          cateringResult.error.issues.forEach(err => {
            errors.push(`Catering: ${err.path.join('.')}: ${err.message}`);
          });
        }
      }
      break;

    case 'takeout':
      // Takeout requires customer info unless from an anonymous source (kiosk)
      if (!isAnonymousSource) {
        if (!data.customerInfo) {
          errors.push('Customer information is required for takeout orders');
        } else {
          validateCustomerInfo(data.customerInfo, errors);
        }
      } else if (data.customerInfo) {
        // Kiosk may optionally provide customer info — validate if present
        validateCustomerInfo(data.customerInfo, errors);
      }
      break;

    case 'dine-in':
      // Dine-in requires table assignment
      if (!data.tableId && !data.tableNumber) {
        errors.push('Table ID or table number is required for dine-in orders');
      }
      break;

    default:
      errors.push(`Unknown order type: ${orderType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
