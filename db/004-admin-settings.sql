BEGIN;
ALTER TABLE public."BarberShop"
    ADD COLUMN IF NOT EXISTS break_start time,
    ADD COLUMN IF NOT EXISTS break_end time;
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='public."BarberShop"'::regclass AND conname='salon_valid_break') THEN
        ALTER TABLE public."BarberShop" ADD CONSTRAINT salon_valid_break CHECK (
        (break_start IS NULL AND break_end IS NULL) OR
        (break_start IS NOT NULL AND break_end IS NOT NULL AND
         opens < break_start AND break_start < break_end AND break_end < closes)
        );
    END IF;
END $$;
ALTER TABLE public."BarbershopService"
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS public.salon_blocked_day (
    salon_id text NOT NULL REFERENCES public."BarberShop"(id) ON DELETE CASCADE,
    day date NOT NULL,
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 160),
    PRIMARY KEY (salon_id, day)
);
ALTER TABLE public.salon_blocked_day ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.salon_blocked_day FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname=api_role) THEN
            EXECUTE format('REVOKE ALL ON public.salon_blocked_day FROM %I', api_role);
        END IF;
    END LOOP;
END $$;
COMMIT;
