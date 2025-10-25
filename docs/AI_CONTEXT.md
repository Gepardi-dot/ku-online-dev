# AI Project Context

## Tooling Stack
- **Windsurf** – primary coding environment for rapid iteration.
- **Codex CLI** – command-line assistant for automation and scripting support.
- **Supabase CLI & MCP** – manage database schema, storage, and edge functions, plus leverage MCP workflows for Supabase-specific automation.
- **Vercel CLI** – deploy previews, inspect logs, and manage environment variables for the Next.js frontend.

Run `npm run tooling:status` to audit whether the Vercel and Supabase CLIs (including MCP support) are installed locally and authenticated. The script falls back to actionable guidance when a binary is missing or when additional login steps are required.

## Production Readiness Priorities
1. **Centralize Supabase environment configuration** to avoid runtime crashes due to missing variables and to provide typed accessors for shared keys.
2. **Harden media upload handling** by enforcing file size, type, and count constraints server-side and returning actionable API errors.
3. **Complete the favorites experience** by wiring the existing `ProductFavoriteButton` into listing cards and product pages, ensuring favorite state is hydrated server-side.
4. **Adopt the Supabase edge search function** so that search queries use ranked full-text results with pagination support and proper fallbacks.

These focus areas, along with the standardized tooling above, form the roadmap toward a production-ready launch.
