BEGIN;
ALTER TABLE public.booking
    ADD COLUMN IF NOT EXISTS service_id text,
    ADD COLUMN IF NOT EXISTS price_in_cents integer CHECK (price_in_cents >= 0),
    ADD COLUMN IF NOT EXISTS manage_hash bytea CHECK (octet_length(manage_hash) = 32),
    ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS booking_manage_hash ON public.booking(manage_hash)
    WHERE manage_hash IS NOT NULL;
ALTER TABLE public.booking ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON public.booking FROM %I', api_role);
        END IF;
    END LOOP;
END $$;
COMMIT;
