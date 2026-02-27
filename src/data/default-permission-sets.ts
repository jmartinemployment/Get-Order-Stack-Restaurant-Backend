/**
 * Default permission sets seeded for every restaurant.
 * Keys match PERMISSION_DEFINITIONS in the frontend staff-management model.
 *
 * 6 role-named sets: Owner, Manager, Server, Cashier, Kitchen, Host
 */

export const ALL_PERMISSION_KEYS = [
  // Administration
  'administration.access',

  // POS Domain
  'pos.take_orders',
  'pos.apply_discounts',
  'pos.void_items',
  'pos.process_refunds',
  'pos.open_cash_drawer',
  'pos.manage_tabs',

  // Menu Domain
  'menu.view',
  'menu.edit_items',
  'menu.edit_prices',
  'menu.eighty_six',

  // Time Clock Domain
  'timeclock.clock_in_out',
  'timeclock.manage_breaks',
  'timeclock.edit_timecards',
  'timeclock.approve_edits',

  // Team Domain
  'team.view',
  'team.manage',
  'team.manage_permissions',

  // Reporting Domain
  'reporting.view_sales',
  'reporting.view_labor',
  'reporting.view_inventory',
  'reporting.close_of_day',

  // Settings Domain
  'settings.view',
  'settings.edit',
  'settings.manage_devices',
] as const;

function allOn(): Record<string, boolean> {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true]));
}

function allOff(): Record<string, boolean> {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false]));
}

export interface DefaultPermissionSet {
  name: string;
  permissions: Record<string, boolean>;
  isDefault: true;
}

export const DEFAULT_PERMISSION_SETS: DefaultPermissionSet[] = [
  {
    name: 'Owner',
    permissions: allOn(),
    isDefault: true,
  },
  {
    name: 'Manager',
    permissions: {
      ...allOn(),
      'settings.manage_devices': false,
      'team.manage_permissions': false,
    },
    isDefault: true,
  },
  {
    name: 'Server',
    permissions: {
      ...allOff(),
      'pos.take_orders': true,
      'pos.manage_tabs': true,
      'pos.apply_discounts': true,
      'menu.view': true,
      'menu.eighty_six': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
      'reporting.view_sales': true,
    },
    isDefault: true,
  },
  {
    name: 'Cashier',
    permissions: {
      ...allOff(),
      'pos.take_orders': true,
      'pos.open_cash_drawer': true,
      'menu.view': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
    },
    isDefault: true,
  },
  {
    name: 'Kitchen',
    permissions: {
      ...allOff(),
      'menu.view': true,
      'menu.eighty_six': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
    },
    isDefault: true,
  },
  {
    name: 'Host',
    permissions: {
      ...allOff(),
      'menu.view': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
    },
    isDefault: true,
  },
];

/** Maps legacy StaffPin.role to a default permission set name */
export const ROLE_TO_PERMISSION_SET: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Server',
};

/** Maps old permission set names to new role-named equivalents */
export const LEGACY_SET_RENAME: Record<string, string> = {
  'Full Access': 'Owner',
  'Standard': 'Server',
  'Limited': 'Cashier',
};
