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

-- device_modes table (may not exist if table was not yet created)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_modes') THEN
    UPDATE device_modes SET device_type = 'terminal' WHERE device_type IN ('pos_terminal', 'order_pad');
    UPDATE device_modes SET device_type = 'kds' WHERE device_type = 'kds_station';
    UPDATE device_modes SET device_type = 'printer' WHERE device_type = 'printer_station';
  END IF;
END $$;
