# CLLA StudioBook

Cada salão tem um catálogo público em `/s/{slug}` e uma área administrativa em `/s/{slug}/admin`. A API associa a sessão ao salão autenticado e verifica esse vínculo nas operações administrativas.

## Executar localmente

Use Node.js 22 LTS, npm, SDK .NET 10 e um banco PostgreSQL. Na raiz, aplique o SQL com um usuário que tenha permissão de criar e alterar tabelas. Use o formato de conexão aceito por cada ferramenta.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001-studiobook.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002-client-directory.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003-client-bookings.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/demo.sql
export ConnectionStrings__StudioBook='Host=localhost;Database=studiobook;Username=studiobook;Password=SUA_SENHA'
# No Bash, leia a senha administrativa sem gravá-la no histórico.
read -rsp 'Senha do administrador (mínimo 12 caracteres): ' STUDIOBOOK_ADMIN_PASSWORD
export STUDIOBOOK_ADMIN_PASSWORD
dotnet run --project api -- admin studio-amaral admin@example.com
unset STUDIOBOOK_ADMIN_PASSWORD
ASPNETCORE_ENVIRONMENT=Development dotnet run --project api -- --urls http://127.0.0.1:5080
```

Em outro terminal execute `npm ci` e `npm run dev`. Abra `http://localhost:3000/s/studio-amaral`. O Next encaminha as chamadas à API. Configure `STUDIOBOOK_API_URL` antes de compilar e executar o frontend se a API tiver outro endereço. Use `npm run lint`, `npm run build` e `dotnet build api` para verificar o projeto.

## Salões e dados existentes

A migração mantém os IDs, serviços e preços das tabelas Prisma existentes. Salões antigos recebem o slug inicial `salao-{id}`. Antes de divulgar o link ou cadastrar o administrador, o operador pode definir um slug exclusivo composto de letras minúsculas, números e hífens. Mantenha-o estável depois disso. Em um banco novo o script de demonstração inclui Studio Amaral, Barbearia Lopes, Clínica Estética Lucca e Nutrição Marina Costa. Os números de busca vão de (11) 00000-0001 a (11) 00000-0004, nessa ordem. O script pode ser repetido e não cria senhas.

Para incluir outro estabelecimento, use os INSERTs do arquivo de demonstração como modelo, com ID, slug e telefone de busca próprios. Grave o telefone em `directory_phone` com o prefixo 55 e apenas dígitos. O campo `layout` aceita `salon`, `barbershop`, `clinic` ou `nutrition`. A lista de estabelecimentos do cliente é guardada no navegador. Cadastre o administrador com o comando local acima, usando o slug e o e-mail desse salão. A mesma operação nunca substitui um administrador existente.

## Regras da primeira versão

Cada salão tem uma agenda compartilhada e um administrador. Os horários iniciais vão de segunda a sábado, das 9h às 18h no fuso de São Paulo. O operador pode ajustar opens, closes e workdays no cadastro e minutes em cada serviço. A reserva considera a duração completa e os atendimentos existentes, em intervalos de início de 15 minutos, até 90 dias à frente. O cliente recebe a confirmação na própria página. O administrador consulta o dia e cancela reservas.

Em produção, publique o Next com HTTPS, mantenha a API atrás do proxy e persista as chaves de Data Protection do ASP.NET Core para preservar sessões entre reinícios e réplicas. Aplique os três arquivos de migração em ordem antes de iniciar a aplicação. A conexão PostgreSQL da API deve usar o proprietário das tabelas ou um papel de servidor com as permissões e políticas necessárias.

## Verificar o isolamento

Em um banco de teste, prepare dois salões com administradores distintos. Defina TEST_ORIGIN (por exemplo, http://localhost:3000), TEST_SALON_A e TEST_SALON_B com os slugs, e TEST_EMAIL_A, TEST_PASSWORD_A, TEST_EMAIL_B e TEST_PASSWORD_B com as credenciais de teste. Execute `node tests/salon-isolation.mjs`. O teste verifica login, leitura da agenda e bloqueio de cancelamento cruzado.

## Identidades visuais

Os quatro locais de demonstração usam as suas próprias capas, monogramas e
paletas. As capas WebP estão em `public/estabelecimentos`, associadas pelo slug
em `lib/salon-brand.ts`. Os outros estabelecimentos continuam usando a imagem
configurada no banco e o layout da própria categoria. Não há migração adicional
para as capas.

## Agendamentos do cliente

O cliente entra em **Meus locais**, adiciona um local pelo telefone com DDD e
pode favoritar ou remover apenas o cartão no próprio navegador. Depois de
agendar, **Meus agendamentos** mostra suas reservas salvas nesse navegador e o
próximo horário aparece na página inicial. Para usar outro aparelho, copie o
link privado da reserva; ele permite consultar e administrar aquele agendamento.
Não o compartilhe com desconhecidos. Reservas anteriores à migração 003 seguem
disponíveis no painel administrativo, mas não ganham link retroativamente.

A alteração pelo cliente fica disponível até duas horas antes do atendimento.
Ao remarcar, uma única transação valida a disponibilidade e muda o horário.
Um conflito não cancela a reserva original. Na exportação para o calendário
(.ics), é possível incluir um lembrete local de uma hora; não há envio por
e-mail ou WhatsApp. Após remarcar ou cancelar, revise o evento no calendário.

Para validar esse fluxo localmente com os dados de demonstração, execute
`TEST_ORIGIN=http://localhost:3000 node tests/customer-bookings.mjs` em um banco
descartável. O teste cria, remarca e cancela agendamentos fictícios.
