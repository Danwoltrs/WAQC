-- Add slug column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create function to generate slug from text
CREATE OR REPLACE FUNCTION generate_client_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Convert to lowercase, replace spaces and special chars with hyphens
  base_slug := LOWER(TRIM(input_text));
  base_slug := REGEXP_REPLACE(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := REGEXP_REPLACE(base_slug, '^-+|-+$', '', 'g'); -- Trim leading/trailing hyphens
  base_slug := SUBSTRING(base_slug FROM 1 FOR 50); -- Limit length

  -- Start with base slug
  final_slug := base_slug;

  -- Check for uniqueness and add number if needed
  WHILE EXISTS (SELECT 1 FROM clients WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Generate slugs for existing clients that don't have one
UPDATE clients
SET slug = generate_client_slug(COALESCE(fantasy_name, company))
WHERE slug IS NULL;

-- Create trigger to auto-generate slug on insert
CREATE OR REPLACE FUNCTION set_client_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := generate_client_slug(COALESCE(NEW.fantasy_name, NEW.company));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_client_slug ON clients;
CREATE TRIGGER trigger_set_client_slug
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION set_client_slug();

-- Create index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
