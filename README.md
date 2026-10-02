# RBXIS Sensitivity Panel

Painel de geração de sensibilidade com autenticação por key e vínculo de dispositivo (HWID).

## API de keys

O projeto usa diretamente a coleção pública da MockAPI:

`https://69b9908ce69653ffe6a81689.mockapi.io/api/v1/keys`

Não é necessário configurar URL, token ou segredo de banco no frontend. As chamadas são feitas pelo backend (`server/mockapi.ts` no servidor Node e `api/trpc.ts` no deploy serverless).

### Formato esperado da key

```json
{
  "id": "1",
  "key": "SENSI-weekly-F1B49B794F9A",
  "used": false,
  "device": "",
  "expire": 7,
  "type": "weekly",
  "createdAt": 1790028013,
  "activatedAt": 0,
  "expiresAt": 0,
  "status": "active"
}
```

- `key`: valor digitado pelo usuário.
- `used`: indica que a key já foi ativada; a sessão continua permitida no mesmo HWID.
- `device`: HWID persistido no navegador e enviado no login; uma key vinculada não pode ser usada em outro dispositivo.
- `expire`: duração numérica, em dias quando a key é criada pelo painel.
- `type`: normalmente `daily`, `weekly`, `monthly`, `yearly` ou `perm`.
- `createdAt`, `activatedAt`, `expiresAt` e `onlineAt`: Unix timestamp em segundos. `expiresAt: 0` significa ainda não ativada ou acesso permanente, dependendo de `type`.
- `status`: `active`, `revoked` ou `blocked`.
- `history`: lista opcional de configurações geradas.

Na primeira ativação, o backend grava `device`, `used`, `activatedAt`, `expiresAt` e `onlineAt`. A key pode ser reutilizada apenas pelo mesmo HWID.

## Desenvolvimento

```bash
pnpm install
pnpm check
pnpm test
pnpm dev
```

A interface usa uma paleta azul sobre o tema escuro.
