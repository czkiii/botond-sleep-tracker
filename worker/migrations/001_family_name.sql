ALTER TABLE families ADD COLUMN name TEXT;
UPDATE families SET name = 'Solemi család' WHERE name IS NULL OR TRIM(name) = '';
