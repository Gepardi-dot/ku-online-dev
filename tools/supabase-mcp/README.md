### Supabase MCP Server

1. Copy `.env.example` to `.env` and fill in your Supabase credentials.
2. Install dependencies (already done for this repo): `npm install`.
3. Run in development: `npm run dev`. Build with `npm run build` and run compiled output using `npm start`.
4. Set `SUPABASE_MCP_MODE=read` (default) for read-only tools, or `SUPABASE_MCP_MODE=write` to expose mutation/storage tools.

The server registers the following tools:

| Tool name                 | Description                              |
|---------------------------|------------------------------------------|
| `supabase.select`         | Query rows using the anon key when set.  |
| `supabase.insert`         | Insert rows with the service role (`write` mode only). |
| `supabase.update`         | Update rows with filter criteria (`write` mode only). |
| `supabase.delete`         | Delete rows with filter criteria (`write` mode only). |
| `supabase.storageUpload`  | Upload base64 data into the bucket (`write` mode only). |
| `supabase.health`         | Verify connectivity and report current mode. |

Configure Cursor via `.cursor/mcp.json` to start this server automatically (or use `tools/mcp/run-supabase-tooling.mjs`), then restart Cursor (or reload MCP servers) after setting environment variables.
