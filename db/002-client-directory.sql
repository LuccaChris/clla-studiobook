BEGIN;

ALTER TABLE public."BarberShop"
    ADD COLUMN IF NOT EXISTS directory_phone text
        CHECK (directory_phone ~ '^55[1-9][0-9]{9,10}$'),
    ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'salon'
        CHECK (layout IN ('salon', 'barbershop', 'clinic', 'nutrition'));

-- Import existing numbers only when they identify one establishment.
WITH cleaned AS (
    SELECT b.id, phone.ordinal, regexp_replace(phone.value, '[^0-9]', '', 'g') AS digits
    FROM public."BarberShop" b
    CROSS JOIN LATERAL unnest(b.phones) WITH ORDINALITY AS phone(value, ordinal)
), normalized AS (
    SELECT id, ordinal,
        CASE WHEN length(digits) IN (10, 11) THEN '55' || digits ELSE digits END AS number
    FROM cleaned
), unique_numbers AS (
    SELECT number
    FROM normalized
    WHERE number ~ '^55[1-9][0-9]{9,10}$'
    GROUP BY number
    HAVING count(DISTINCT id) = 1
), primary_numbers AS (
    SELECT DISTINCT ON (n.id) n.id, n.number
    FROM normalized n
    JOIN unique_numbers u USING (number)
    WHERE NOT EXISTS (
        SELECT 1 FROM public."BarberShop" b WHERE b.directory_phone = n.number
    )
    ORDER BY n.id, n.ordinal
)
UPDATE public."BarberShop" b SET directory_phone = p.number
FROM primary_numbers p WHERE b.id = p.id AND b.directory_phone IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS salon_directory_phone ON public."BarberShop"(directory_phone);
ALTER TABLE public."BarberShop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BarbershopService" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BarberShop", public."BarbershopService" FROM PUBLIC;

DO $$
DECLARE
    api_role text;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format(
                'REVOKE ALL ON public."BarberShop", public."BarbershopService" FROM %I',
                api_role
            );
        END IF;
    END LOOP;
END
$$;

COMMIT;
