### Supabase MCP Server

1. Copy `.env.example` to `.env` and fill in your Supabase credentials.
2. Install dependencies (already done for this repo): `npm install`.
3. Run in development: `npm run dev`. Build with `npm run build` and run compiled output using `npm start`.

The server registers the following tools:

| Tool name                 | Description                              |
|---------------------------|------------------------------------------|
| `supabase.select`         | Query rows using the anon key when set.  |
| `supabase.insert`         | Insert rows with the service role.       |
| `supabase.update`         | Update rows with filter criteria.        |
| `supabase.delete`         | Delete rows with filter criteria.        |
| `supabase.storageUpload`  | Upload base64 data into the bucket.      |

Configure Cursor via `.cursor/mcp.json` to start this server automatically (already committed). Restart Cursor or reload MCP servers after setting environment variables.***
