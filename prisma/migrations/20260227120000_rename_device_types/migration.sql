-- Rename device_type values to industry-standard names
-- pos_terminal / order_pad → terminal
-- kds_station → kds
-- printer_station → printer
-- kiosk stays kiosk
-- register is new (no existing rows)

-- devices table
UPDATE devices SET device_type = 'terminal' WHERE device_type IN ('pos_terminal', 'order_pad');
UPDATE devices SET device_type = 'kds' WHERE device_type = 'kds_station';
UPDATE devices SET device_type = 'printer' WHERE device_type = 'printer_station';

-- device_modes table
UPDATE device_modes SET device_type = 'terminal' WHERE device_type IN ('pos_terminal', 'order_pad');
UPDATE device_modes SET device_type = 'kds' WHERE device_type = 'kds_station';
UPDATE device_modes SET device_type = 'printer' WHERE device_type = 'printer_station';
