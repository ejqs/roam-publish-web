# Connection to extension

The Depot extension (`roam-publish`) should:

1. Collect Roam append token + graph name in Settings.
2. Call `POST {baseUrl}/api/auth/exchange`.
3. Persist returned `apiKey` (and `baseUrl` / `graphName`).
4. Call `POST /api/publish` with `Authorization: Bearer {apiKey}` and serialized content.
5. Open / badge-link the returned `url` (`/{graphName}/{uid}`).

Full shapes: [api-contract.md](./api-contract.md).

Do not send team/group destination fields in this slice.
