BEGIN;
SELECT pg_advisory_xact_lock(7324091);
CREATE TABLE IF NOT EXISTS "BarberShop" (
 id text PRIMARY KEY, nome text NOT NULL, address text NOT NULL,
 description text NOT NULL, "imageUrl" text NOT NULL, phones text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS "BarbershopService" (
 id text PRIMARY KEY, nome text NOT NULL, description text NOT NULL, "imageUrl" text NOT NULL,
 "priceInCents" integer NOT NULL, "barbershopId" text NOT NULL REFERENCES "BarberShop"(id) ON DELETE CASCADE
);
ALTER TABLE "BarberShop" ADD COLUMN IF NOT EXISTS slug text;
UPDATE "BarberShop" SET slug = 'salao-' || id WHERE slug IS NULL;
ALTER TABLE "BarberShop" ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS salon_slug ON "BarberShop"(slug);
ALTER TABLE "BarbershopService" ADD COLUMN IF NOT EXISTS minutes integer NOT NULL DEFAULT 30 CHECK(minutes BETWEEN 5 AND 480);
CREATE TABLE IF NOT EXISTS salon_admin (
 salon_id text PRIMARY KEY REFERENCES "BarberShop"(id), email text NOT NULL, password_hash text NOT NULL
);
ALTER TABLE "BarberShop" ADD COLUMN IF NOT EXISTS opens time NOT NULL DEFAULT TIME '09:00';
ALTER TABLE "BarberShop" ADD COLUMN IF NOT EXISTS closes time NOT NULL DEFAULT TIME '18:00';
ALTER TABLE "BarberShop" ADD COLUMN IF NOT EXISTS workdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::smallint[];
CREATE TABLE IF NOT EXISTS booking (
 id uuid PRIMARY KEY, salon_id text NOT NULL REFERENCES "BarberShop"(id),
 service_name text NOT NULL, customer text NOT NULL, starts_at timestamp NOT NULL,
 ends_at timestamp NOT NULL, CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS booking_calendar ON booking(salon_id, starts_at);
COMMIT;
