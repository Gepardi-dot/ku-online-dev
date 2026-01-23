# Vonage MCP Tooling Server (local)

This repo supports running the Vonage MCP Tooling Server as a local MCP process (stdio), so your IDE/agent can send SMS/voice/WhatsApp actions through Vonage tooling.

## 1) Install prerequisites

- Node.js (repo requirement: see `.node-version`)
- Vonage credentials + an application (create in Vonage Dashboard)

## 2) Set environment variables

Add these to your local `.env.local` (untracked) or OS environment:

```
VONAGE_API_KEY=...
VONAGE_API_SECRET=...
VONAGE_APPLICATION_ID=...
VONAGE_PRIVATE_KEY64=...
VONAGE_VIRTUAL_NUMBER=+1234567890
```

Notes:
- `VONAGE_PRIVATE_KEY64` should be the base64-encoded contents of your Vonage private key.
- Keep these values out of git; `.env.local` is already ignored by `.gitignore`.

PowerShell helper to create `VONAGE_PRIVATE_KEY64`:

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("private.key"))
```

## 3) Cursor MCP config

This repo includes a Cursor MCP server entry in `.cursor/mcp.json` that runs `tools/mcp/run-vonage-tooling.mjs`.

- Restart Cursor (or reload MCP servers) after setting the env vars.

## 4) Quick sanity check

From the repo root, you can check the package starts with:

```
npx -y @vonage/vonage-mcp-server-api-bindings --help
```

You can also verify your local env + basic Vonage connectivity (no secrets printed) with:

```
npm run vonage:status
```

If your client starts the server but tools fail, verify your env vars are present in the app/IDE environment (not just a terminal session).
