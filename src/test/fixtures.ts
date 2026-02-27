/**
 * Shared test fixture data.
 * All IDs are deterministic UUIDs for predictable test assertions.
 */

export const RESTAURANT_ID = 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38';
export const RESTAURANT_GROUP_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export const USERS = {
  superAdmin: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@orderstack.com',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
    isActive: true,
    passwordHash: '$2b$10$mock-hash-super-admin',
    restaurantGroupId: null,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
  },
  owner: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'owner@taipa.com',
    firstName: 'Owner',
    lastName: 'User',
    role: 'owner',
    isActive: true,
    passwordHash: '$2b$10$mock-hash-owner',
    restaurantGroupId: RESTAURANT_GROUP_ID,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
    restaurantAccess: [
      {
        id: 'access-1',
        teamMemberId: '00000000-0000-0000-0000-000000000002',
        restaurantId: RESTAURANT_ID,
        role: 'owner',
        restaurant: {
          id: RESTAURANT_ID,
          name: 'Taipa Restaurant',
          slug: 'taipa',
        },
      },
    ],
  },
  manager: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'manager@taipa.com',
    firstName: 'Manager',
    lastName: 'User',
    role: 'manager',
    isActive: true,
    passwordHash: '$2b$10$mock-hash-manager',
    restaurantGroupId: RESTAURANT_GROUP_ID,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
    restaurantAccess: [
      {
        id: 'access-2',
        teamMemberId: '00000000-0000-0000-0000-000000000003',
        restaurantId: RESTAURANT_ID,
        role: 'manager',
        restaurant: {
          id: RESTAURANT_ID,
          name: 'Taipa Restaurant',
          slug: 'taipa',
        },
      },
    ],
  },
  staff: {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'staff@taipa.com',
    firstName: 'Staff',
    lastName: 'User',
    role: 'staff',
    isActive: true,
    passwordHash: '$2b$10$mock-hash-staff',
    restaurantGroupId: RESTAURANT_GROUP_ID,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
    restaurantAccess: [
      {
        id: 'access-3',
        teamMemberId: '00000000-0000-0000-0000-000000000004',
        restaurantId: RESTAURANT_ID,
        role: 'staff',
        restaurant: {
          id: RESTAURANT_ID,
          name: 'Taipa Restaurant',
          slug: 'taipa',
        },
      },
    ],
  },
} as const;

export const RESTAURANT = {
  id: RESTAURANT_ID,
  name: 'Taipa Restaurant',
  slug: 'taipa',
  active: true,
  restaurantGroupId: RESTAURANT_GROUP_ID,
  taxRate: 0.07,
  businessType: 'food_and_drink',
  address: '123 Main St',
  city: 'Fort Lauderdale',
  state: 'FL',
  zipCode: '33301',
  phone: '954-555-0100',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const SESSION = {
  id: 'session-00000000-0000-0000-0000-000000000001',
  teamMemberId: USERS.owner.id,
  token: 'mock-session-token',
  isActive: true,
  deviceInfo: 'vitest',
  ipAddress: '127.0.0.1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  createdAt: new Date(),
};

export const COMBO = {
  id: 'combo-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Lunch Special',
  description: 'Burger + Fries + Drink',
  comboPrice: 12.99,
  isActive: true,
  items: [
    { menuItemId: 'item-1', menuItemName: 'Burger', quantity: 1, required: true },
    { menuItemId: 'item-2', menuItemName: 'Fries', quantity: 1, required: true },
    { menuItemId: 'item-3', menuItemName: 'Drink', quantity: 1, required: false },
  ],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const STATION = {
  id: 'station-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Grill Station',
  color: '#FF5733',
  displayOrder: 0,
  isExpo: false,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const ORDER = {
  id: 'order-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  orderNumber: 'ORD-TEST-001',
  orderType: 'dine-in',
  orderSource: 'pos',
  sourceDeviceId: null,
  status: 'confirmed',
  subtotal: 25.98,
  tax: 1.82,
  tip: 0,
  total: 27.80,
  tableId: 'table-1',
  customerId: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const CHECK = {
  id: 'check-00000000-0000-0000-0000-000000000001',
  orderId: ORDER.id,
  restaurantId: RESTAURANT_ID,
  displayNumber: 1,
  subtotal: 25.98,
  tax: 1.82,
  tip: 0,
  total: 27.80,
  tabName: null,
  tabOpenedAt: null,
  tabClosedAt: null,
  preauthId: null,
  paymentStatus: 'OPEN',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const CHECK_ITEM = {
  id: 'check-item-00000000-0000-0000-0000-000000000001',
  checkId: CHECK.id,
  orderId: ORDER.id,
  menuItemId: 'item-1',
  menuItemName: 'Burger',
  quantity: 1,
  unitPrice: 12.99,
  modifiersPrice: 0,
  totalPrice: 12.99,
  specialInstructions: null,
  seatNumber: null,
  courseGuid: null,
  isComped: false,
  compReason: null,
  compBy: null,
  compApprovedBy: null,
  compAt: null,
  createdAt: new Date('2025-01-01'),
};

export const GIFT_CARD = {
  id: 'gc-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  code: 'GIFT-ABC-123',
  balance: 50.00,
  initialBalance: 50.00,
  isActive: true,
  expiresAt: new Date('2026-12-31'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const INVOICE = {
  id: 'inv-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  customerId: 'cust-1',
  invoiceNumber: 'INV-001',
  status: 'pending',
  subtotal: 100.00,
  tax: 7.00,
  total: 107.00,
  dueDate: new Date('2026-03-01'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};
