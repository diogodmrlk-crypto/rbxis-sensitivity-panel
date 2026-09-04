# RBXIS Sensitivity Lab

Aplicação web em **TypeScript + React + tRPC + Drizzle + MySQL/TiDB** para geração de sensibilidades, controle de licenças e vínculo de acesso por dispositivo. A identidade visual é inspirada no vídeo de referência: dark mode, vermelho de ação, cards compactos e navegação mobile-first.

## O que foi implementado

- Login de usuário por **nome + chave aleatória**.
- Chave administrativa inicial: **`Ferraodev`**. Ela abre uma área separada, invisível ao fluxo normal do usuário, com gestão de acessos.
- Criação de licenças com plano, duração em dias/semanas/meses/anos e chave gerada automaticamente.
- Ações administrativas para alterar plano, bloquear usuário, revogar chave e resetar vínculo de dispositivo.
- Vínculo server-side por HWID lógico persistido: após o primeiro login, a licença não aceita outro identificador de dispositivo.
- Gerador determinístico por sistema operacional, aparelho e performance, com cópia dos valores.
- Histórico e favoritos persistidos no banco.
- Aviso central de instalação que desaparece após 4 segundos e usa o prompt nativo `beforeinstallprompt` quando disponível.
- Manifesto e service worker PWA.
- Entry point serverless em `api/index.ts` e `vercel.json` para subir frontend e tRPC na Vercel.
- O fluxo do produto não usa a API do Manus; as chamadas são internas em `/api/trpc`.
- O redeploy automático acontece pela integração GitHub da Vercel: cada push na branch `main` gera um novo deployment.

## Variáveis de produção

Configure na Vercel:

```env
DATABASE_URL=...
RBXIS_ADMIN_KEY=Ferraodev
RBXIS_SESSION_SECRET=um-segredo-longo-e-aleatorio
```

`RBXIS_ADMIN_KEY` mantém o acesso solicitado pelo proprietário. Recomenda-se substituir por uma chave privada antes de distribuir o painel. Se `RBXIS_SESSION_SECRET` não for definido, o app usa `JWT_SECRET` apenas como compatibilidade com o scaffold.

Para evitar bloqueio no primeiro deploy, o app possui um fallback temporário de sessão. Em produção, configure `RBXIS_SESSION_SECRET` na Vercel antes de compartilhar o endereço público.

## Desenvolvimento

```bash
pnpm install
pnpm db:push
pnpm dev
```

Validação local:

```bash
pnpm check
pnpm test
pnpm build
```

A migration idempotente está em `drizzle/0001_funny_sentinel.sql`. O banco do projeto já recebeu as tabelas `product_licenses` e `sensitivity_history`.

Após cada push, confira o deployment associado ao commit na Vercel. O endpoint `https://seu-dominio.vercel.app/api/health` deve responder `{ "ok": true, "service": "rbxis" }` antes de testar o login.

## Fluxo de uso

1. Entre no **Acesso administrativo** usando `Ferraodev`.
2. Abra **Licenças & usuários** e clique em **Criar novo acesso**.
3. Defina o nome, plano e duração. Copie a chave exibida no banner seguro.
4. Compartilhe com o usuário o nome e a chave. No primeiro login, o dispositivo fica vinculado.

O recurso de HWID usa um identificador persistido no armazenamento local do navegador e validado no servidor. Limpar o armazenamento, trocar de navegador ou trocar de celular não libera a licença em outro aparelho; nesses casos o administrador precisa usar **Resetar dispositivo**.
