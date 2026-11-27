BEGIN;

-- Os números usam uma sequência ilustrativa e servem apenas para busca.
INSERT INTO public."BarberShop"
    (id, slug, nome, address, description, "imageUrl", phones, directory_phone, layout, opens, closes, workdays)
VALUES
    ('demo-studiobook', 'studio-amaral', 'Studio Amaral', 'São Paulo · unidade de teste',
     'Cortes, escovas e cuidados para o seu cabelo.', '', ARRAY['11000000001'],
     '5511000000001', 'salon', '09:00', '18:00', ARRAY[2,3,4,5,6]::smallint[]),
    ('demo-lopes', 'barbearia-lopes', 'Barbearia Lopes', 'São Paulo · unidade de teste',
     'Cortes clássicos, acabamento e barba.', '', ARRAY['11000000002'],
     '5511000000002', 'barbershop', '10:00', '19:00', ARRAY[1,2,3,4,5,6]::smallint[]),
    ('demo-lucca', 'clinica-estetica-lucca', 'Clínica Estética Lucca', 'São Paulo · unidade de teste',
     'Avaliação estética e cuidados faciais com atendimento agendado.', '', ARRAY['11000000003'],
     '5511000000003', 'clinic', '09:00', '17:00', ARRAY[1,2,3,4,5]::smallint[]),
    ('demo-nutri', 'nutricao-marina-costa', 'Nutrição Marina Costa', 'São Paulo · consultório de teste',
     'Consultas de nutrição e acompanhamento alimentar.', '', ARRAY['11000000004'],
     '5511000000004', 'nutrition', '08:00', '17:00', ARRAY[1,3,5]::smallint[])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."BarbershopService"
    (id, "barbershopId", nome, description, "imageUrl", "priceInCents", minutes)
VALUES
    ('demo-corte', 'demo-studiobook', 'Corte', 'Corte de cabelo', '', 4500, 45),
    ('demo-escova', 'demo-studiobook', 'Escova', 'Escova e finalização', '', 6500, 45),
    ('demo-lopes-corte', 'demo-lopes', 'Corte clássico', 'Corte e acabamento', '', 5500, 30),
    ('demo-lopes-barba', 'demo-lopes', 'Barba', 'Barba e toalha quente', '', 4000, 30),
    ('demo-lucca-avaliacao', 'demo-lucca', 'Avaliação estética', 'Primeiro atendimento', '', 9000, 45),
    ('demo-lucca-limpeza', 'demo-lucca', 'Limpeza de pele', 'Cuidado facial', '', 16000, 60),
    ('demo-nutri-consulta', 'demo-nutri', 'Consulta inicial', 'Consulta de nutrição', '', 18000, 60),
    ('demo-nutri-retorno', 'demo-nutri', 'Retorno', 'Acompanhamento nutricional', '', 12000, 30)
ON CONFLICT (id) DO NOTHING;

COMMIT;
