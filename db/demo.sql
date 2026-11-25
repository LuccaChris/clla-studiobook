BEGIN;
INSERT INTO "BarberShop"(id,slug,nome,address,description,"imageUrl")
VALUES ('demo-studiobook','studio-amaral','Studio Amaral','Centro','Salão de demonstração','/banner.png')
ON CONFLICT (id) DO NOTHING;
INSERT INTO "BarbershopService"(id,"barbershopId",nome,description,"imageUrl","priceInCents",minutes)
VALUES ('demo-corte','demo-studiobook','Corte','Corte de cabelo','/banner.png',4500,45)
ON CONFLICT (id) DO NOTHING;
COMMIT;
