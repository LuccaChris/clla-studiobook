# CLLA StudioBook

Cada salão tem um catálogo público em `/s/{slug}` e uma área administrativa em `/s/{slug}/admin`. A API associa a sessão ao salão autenticado e verifica esse vínculo nas operações administrativas.

## Executar localmente

Use Node.js 22 LTS, npm, SDK .NET 10 e um banco PostgreSQL. Na raiz, aplique o SQL com um usuário que tenha permissão de criar e alterar tabelas. Use o formato de conexão aceito por cada ferramenta.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001-studiobook.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002-client-directory.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003-client-bookings.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/004-admin-settings.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/005-admin-business.sql
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

Cada estabelecimento tem uma agenda e uma conta administrativa próprias. Os horários padrão vão de segunda a sábado, das 9h às 18h no fuso de São Paulo. O administrador pode ajustar horários e duração dos serviços pelo painel. A reserva considera a duração completa e os atendimentos existentes, em intervalos de início de 15 minutos, até 90 dias à frente. O cliente recebe a confirmação na própria página. O administrador consulta o dia, cria, remarca e cancela reservas.

Em produção, publique o Next com HTTPS, mantenha a API atrás do proxy e persista as chaves de Data Protection do ASP.NET Core para preservar sessões entre reinícios e réplicas. Aplique os cinco arquivos de migração em ordem antes de iniciar a aplicação. A conexão PostgreSQL da API deve usar o proprietário das tabelas ou um papel de servidor com as permissões e políticas necessárias.

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

## Administração de cada estabelecimento

O painel está em `/s/{slug}/admin`. O operador cria uma conta por local com
`dotnet run --project api -- admin <slug> <email>` e a variável temporária
`STUDIOBOOK_ADMIN_PASSWORD` (mínimo de 12 caracteres). Use senhas diferentes,
fornecidas ao dono por um canal seguro; não as versione nem envie em links.
A sessão administrativa autoriza somente o estabelecimento do login.

O painel permite alterar nome, descrição, endereço, telefone público de busca
e capa via URL HTTPS; criar, editar e desativar serviços sem apagar reservas;
configurar dias, abertura, fechamento, pausa diária e bloquear datas inteiras.
Por exemplo, 08:00–12:00 e 13:00–18:00 impedem um serviço de 40 minutos às 11:30.
Mudanças de horário e folgas que afetam reservas futuras confirmadas são
recusadas. Nenhuma reserva é cancelada ao desativar um serviço. Remarcações de
reservas existentes mantêm a duração originalmente contratada.

Para conferir o painel e as regras da agenda, use as mesmas variáveis do
teste de isolamento, com `TEST_SALON_A=studio-amaral` e
`TEST_SALON_B=barbearia-lopes`, e execute `node tests/admin-settings.mjs`
somente em banco descartável. Esse teste altera os dados de demonstração.

### Painel do dono: operação e resumo do negócio

A migração `db/005-admin-business.sql` precisa ser aplicada **depois** da 004 e **antes** de subir a nova API. Ela preserva reservas antigas; quando a origem não foi registrada, o resumo mostra “Não registrada”. A agenda continua sendo de um único profissional por local.

- **Hoje:** a tela inicial mostra o próximo atendimento do dia, o atalho de novo agendamento, pendências com links para resolver e horários publicáveis de amanhã por serviço. Perfil, serviços e horários ficam agrupados em Configurações.
- **Agenda:** adicione reservas de telefone, WhatsApp e balcão. O StudioBook usa a mesma disponibilidade para evitar dupla reserva. Remarcar preserva a duração e, nas reservas online, o link do cliente. Ao fim do horário, marque como concluído ou falta. Em um atendimento concluído, registre o preço real, o custo direto e um ou mais recebimentos separados.
- **Horários:** bloqueie só parte do dia, personalize o expediente de uma data e defina antecedência, prazo de alteração para o cliente e intervalo entre serviços. Um horário especial substitui a pausa regular naquele dia. Mudanças que invalidem reservas futuras são rejeitadas. Instruções de preparo do serviço aparecem antes de reservar.
- **Lista de espera:** o dono inclui nome, WhatsApp, serviço e data, com horário opcional. O link só abre uma mensagem pronta; não envia nem segura a vaga. Após o aceite, confirmar cria a reserva e fecha a entrada no mesmo passo, desde que a vaga continue livre.
- **Resumo:** recebimentos seguem as datas dos pagamentos; pendências e lucro estimado, o mês do atendimento. O lucro estimado desconta custos diretos e despesas fixas informadas, e não é exibido se faltar algum custo. Ranking por demanda e margem por hora, origem e estimativa de ocupação também ficam no painel. O resumo distingue clientes novos e recorrentes quando há telefone informado no agendamento, sem exibir o número no resumo ou nas páginas públicas.

Para verificar em banco descartável, carregue as migrações 001 a 005, `db/demo.sql`, os administradores fictícios e `tests/admin-business-fixtures.sql`. Rode `node tests/admin-business.mjs` com `TEST_ORIGIN`, `TEST_EMAIL_A`, `TEST_PASSWORD_A`, `TEST_EMAIL_B`, `TEST_PASSWORD_B` e `TEST_BUSINESS_PAST_DAY` (último dia do mês anterior em São Paulo, AAAA-MM-DD). O teste altera dados e não deve usar produção.

Ao publicar a proteção de cotação, atualize a API e o site juntos (se separados, atualize primeiro a API): a reserva pública envia `expectedPriceInCents` e `expectedMinutes`. Se preço ou duração diferirem, a API retorna 409 com os valores atuais sem ocupar a agenda, e o cliente precisa confirmar novamente. Não exige migração de banco.
