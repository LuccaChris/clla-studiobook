BEGIN;
ALTER TABLE public."BarberShop"
    ADD COLUMN IF NOT EXISTS lead_minutes integer NOT NULL DEFAULT 0 CHECK (lead_minutes BETWEEN 0 AND 10080),
    ADD COLUMN IF NOT EXISTS cutoff_hours integer NOT NULL DEFAULT 2 CHECK (cutoff_hours BETWEEN 0 AND 168),
    ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120);
ALTER TABLE public."BarbershopService"
    ADD COLUMN IF NOT EXISTS preparation text NOT NULL DEFAULT '' CHECK (length(preparation)<=500);
ALTER TABLE public.booking
    ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unknown'
        CHECK (origin IN ('unknown','studiobook','whatsapp','phone','in_person','waitlist')),
    ADD COLUMN IF NOT EXISTS customer_phone text CHECK (customer_phone ~ '^55[1-9][0-9]{9,10}$'),
    ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'scheduled'
        CHECK (outcome IN ('scheduled','completed','no_show')),
    ADD COLUMN IF NOT EXISTS amount_due_cents integer CHECK (amount_due_cents BETWEEN 0 AND 10000000),
    ADD COLUMN IF NOT EXISTS paid_cents integer CHECK (paid_cents BETWEEN 0 AND 10000000),
    ADD COLUMN IF NOT EXISTS direct_cost_cents integer CHECK (direct_cost_cents BETWEEN 0 AND 10000000);


CREATE INDEX IF NOT EXISTS booking_customer_history ON public.booking(salon_id,customer_phone,starts_at)
    WHERE customer_phone IS NOT NULL AND canceled_at IS NULL AND outcome='completed';

CREATE TABLE IF NOT EXISTS public.salon_waitlist (
    id uuid PRIMARY KEY,
    salon_id text NOT NULL REFERENCES public."BarberShop"(id) ON DELETE CASCADE,
    service_id text NOT NULL REFERENCES public."BarbershopService"(id),
    customer text NOT NULL CHECK (length(customer) BETWEEN 1 AND 100),
    phone text NOT NULL CHECK (phone ~ '^55[1-9][0-9]{9,10}$'),
    day date NOT NULL,
    preferred_time time,
    created_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    booking_id uuid REFERENCES public.booking(id)
);
CREATE INDEX IF NOT EXISTS salon_waitlist_open ON public.salon_waitlist(salon_id,day,created_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS salon_waitlist_recovered ON public.salon_waitlist(salon_id,day) WHERE booking_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.salon_monthly_cost (
    salon_id text NOT NULL REFERENCES public."BarberShop"(id) ON DELETE CASCADE,
    month date NOT NULL CHECK (extract(day FROM month)=1),
    amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 100000000),
    PRIMARY KEY (salon_id,month)
);

CREATE TABLE IF NOT EXISTS public.salon_day_hours (
    salon_id text NOT NULL REFERENCES public."BarberShop"(id) ON DELETE CASCADE,
    day date NOT NULL,
    opens time NOT NULL,
    closes time NOT NULL,
    PRIMARY KEY (salon_id,day),
    CHECK (closes>opens)
);
CREATE TABLE IF NOT EXISTS public.salon_time_block (
    id uuid PRIMARY KEY,
    salon_id text NOT NULL REFERENCES public."BarberShop"(id) ON DELETE CASCADE,
    day date NOT NULL,
    starts time NOT NULL,
    ends time NOT NULL,
    note text NOT NULL DEFAULT '' CHECK (length(note)<=160),
    CHECK (ends>starts)
);
CREATE INDEX IF NOT EXISTS salon_time_block_day ON public.salon_time_block(salon_id,day);
CREATE TABLE IF NOT EXISTS public.salon_payment (
    id uuid PRIMARY KEY,
    booking_id uuid NOT NULL REFERENCES public.booking(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
    paid_on date NOT NULL
);
CREATE INDEX IF NOT EXISTS salon_payment_booking ON public.salon_payment(booking_id,paid_on);
ALTER TABLE public.salon_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_day_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_time_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_monthly_cost ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.salon_waitlist,public.salon_monthly_cost,public.salon_day_hours,public.salon_time_block,public.salon_payment FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname=api_role) THEN
            EXECUTE format('REVOKE ALL ON public.salon_waitlist,public.salon_monthly_cost,public.salon_day_hours,public.salon_time_block,public.salon_payment FROM %I', api_role);
        END IF;
    END LOOP;
END $$;
COMMIT;
