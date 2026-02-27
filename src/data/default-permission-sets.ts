/**
 * Default permission sets seeded for every restaurant.
 * Keys match PERMISSION_DEFINITIONS in the frontend staff-management model.
 */

const ALL_PERMISSION_KEYS = [
  'pos.take_orders',
  'pos.apply_discounts',
  'pos.void_items',
  'pos.process_refunds',
  'pos.open_cash_drawer',
  'pos.manage_tabs',
  'menu.view',
  'menu.edit_items',
  'menu.edit_prices',
  'menu.eighty_six',
  'timeclock.clock_in_out',
  'timeclock.manage_breaks',
  'timeclock.edit_timecards',
  'timeclock.approve_edits',
  'team.view',
  'team.manage',
  'team.manage_permissions',
  'reporting.view_sales',
  'reporting.view_labor',
  'reporting.view_inventory',
  'reporting.close_of_day',
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
    name: 'Full Access',
    permissions: allOn(),
    isDefault: true,
  },
  {
    name: 'Standard',
    permissions: {
      ...allOff(),
      'pos.take_orders': true,
      'pos.apply_discounts': true,
      'pos.manage_tabs': true,
      'menu.view': true,
      'menu.eighty_six': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
      'timeclock.edit_timecards': true,
      'team.view': true,
      'reporting.view_sales': true,
    },
    isDefault: true,
  },
  {
    name: 'Limited',
    permissions: {
      ...allOff(),
      'pos.take_orders': true,
      'menu.view': true,
      'timeclock.clock_in_out': true,
      'timeclock.manage_breaks': true,
    },
    isDefault: true,
  },
];

/** Maps legacy StaffPin.role to a default permission set name */
export const ROLE_TO_PERMISSION_SET: Record<string, string> = {
  owner: 'Full Access',
  manager: 'Full Access',
  staff: 'Standard',
};
