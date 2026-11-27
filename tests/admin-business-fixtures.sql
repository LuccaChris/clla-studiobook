-- Fixtures exclusivas para testes. Execute apenas em um banco descartável.
BEGIN;
INSERT INTO booking(id,salon_id,service_id,service_name,customer,starts_at,ends_at,price_in_cents,origin,customer_phone)
SELECT gen_random_uuid(),b.id,s.id,s.nome,fixtures.customer,
    (date_trunc('month',timezone('America/Sao_Paulo',now()))::date-1)+fixtures.at,
    (date_trunc('month',timezone('America/Sao_Paulo',now()))::date-1)+fixtures.at+interval '30 minutes',7000,'phone','5511900000388'
FROM "BarberShop" b CROSS JOIN LATERAL (SELECT id,nome FROM "BarbershopService" WHERE "barbershopId"=b.id ORDER BY id LIMIT 1) s
CROSS JOIN (VALUES ('Atendimento financeiro QA',TIME '10:00'),('Falta financeira QA',TIME '12:00')) fixtures(customer,at)
WHERE b.slug='studio-amaral';
INSERT INTO booking(id,salon_id,service_id,service_name,customer,starts_at,ends_at,price_in_cents,origin,customer_phone,outcome,amount_due_cents,direct_cost_cents)
SELECT gen_random_uuid(),b.id,s.id,s.nome,fixtures.customer,
  timezone('America/Sao_Paulo',now())::date-1+fixtures.at,
  timezone('America/Sao_Paulo',now())::date-1+fixtures.at+interval '30 minutes',0,'phone',fixtures.phone,'completed',0,0
FROM "BarberShop" b CROSS JOIN LATERAL (SELECT id,nome FROM "BarbershopService" WHERE "barbershopId"=b.id ORDER BY id LIMIT 1) s
CROSS JOIN (VALUES ('Retorno QA',TIME '09:00','5511900000388'),('Primeira visita QA',TIME '10:00','5511900000399')) fixtures(customer,at,phone)
WHERE b.slug='studio-amaral' AND extract(day FROM timezone('America/Sao_Paulo',now())::date)>1;
COMMIT;
