import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? "product-images";

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonClient = ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "ilike"
  | "like"
  | "is"
  | "contains"
  | "containedBy"
  | "overlaps";

const filterSchema = z.object({
  column: z.string().min(1),
  operator: z.enum([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "ilike",
    "like",
    "is",
    "contains",
    "containedBy",
    "overlaps",
  ]),
  value: z.any(),
});

type FilterInput = z.infer<typeof filterSchema>;

const selectArgs = {
  table: z.string().min(1),
  columns: z.string().min(1).default("*"),
  filters: z.array(filterSchema).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  order: z
    .object({
      column: z.string().min(1),
      ascending: z.boolean().default(false),
      nullsFirst: z.boolean().optional(),
    })
    .optional(),
} as const;

type SelectArgs = z.infer<z.ZodObject<typeof selectArgs>>;

const insertArgs = {
  table: z.string().min(1),
  values: z.union([z.array(z.record(z.any())), z.record(z.any())]),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} as const;

type InsertArgs = z.infer<z.ZodObject<typeof insertArgs>>;

const updateArgs = {
  table: z.string().min(1),
  values: z.record(z.any()),
  filters: z.array(filterSchema).min(1),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} as const;

type UpdateArgs = z.infer<z.ZodObject<typeof updateArgs>>;

const deleteArgs = {
  table: z.string().min(1),
  filters: z.array(filterSchema).min(1),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} as const;

type DeleteArgs = z.infer<z.ZodObject<typeof deleteArgs>>;

const storageArgs = {
  path: z.string().min(1),
  base64: z.string().min(1),
  contentType: z.string().default("application/octet-stream"),
  upsert: z.boolean().default(false),
} as const;

type StorageArgs = z.infer<z.ZodObject<typeof storageArgs>>;

function responseFromJSON(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: {
      type: "object" as const,
      data,
    },
  };
}

function getClient(kind?: "anon" | "admin"): SupabaseClient {
  if (kind === "anon" && anonClient) {
    return anonClient;
  }
  return adminClient;
}

function applyFilters<T>(
  query: T,
  filters: FilterInput[] | undefined
): T {
  if (!filters?.length) {
    return query;
  }

  let current = query;

  for (const filter of filters) {
    const { column, operator, value } = filter;
    // @ts-expect-error Supabase query builders expose operator helpers dynamically.
    current = current[operator](column, value);
  }

  return current;
}

const server = new McpServer({
  name: "supabase-mcp",
  version: "0.1.0",
});

server.registerTool("supabase.select", {
  description: "Run a SELECT query on the configured Supabase project.",
  inputSchema: selectArgs,
}, async (args: SelectArgs) => {
  const client = getClient("anon");

  let query = client
    .from(args.table)
    .select(args.columns, { count: "exact" })
    .limit(args.limit);

  query = applyFilters(query, args.filters);

  if (args.order) {
    const orderOptions: { ascending: boolean; nullsFirst?: boolean } = {
      ascending: args.order.ascending,
    };
    if (typeof args.order.nullsFirst === "boolean") {
      orderOptions.nullsFirst = args.order.nullsFirst;
    }
    query = query.order(args.order.column, orderOptions);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }

  return responseFromJSON({ count, rows: data });
});

server.registerTool("supabase.insert", {
  description: "Insert one or more rows using the Supabase service role.",
  inputSchema: insertArgs,
}, async (args: InsertArgs) => {
  const payload = Array.isArray(args.values) ? args.values : [args.values];
  const baseQuery = adminClient.from(args.table).insert(payload);
  const finalQuery =
    args.returning === "representation" ? baseQuery.select() : baseQuery;

  const { data, error } = await finalQuery;

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return responseFromJSON(data ?? null);
});

server.registerTool("supabase.update", {
  description:
    "Update rows in a table that match the provided filters using the service role.",
  inputSchema: updateArgs,
}, async (args: UpdateArgs) => {
  const filtered = applyFilters(
    adminClient.from(args.table).update(args.values),
    args.filters
  );

  const finalQuery =
    args.returning === "representation" ? filtered.select() : filtered;

  const { data, error } = await finalQuery;

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }

  return responseFromJSON(data ?? null);
});

server.registerTool("supabase.delete", {
  description:
    "Delete rows in a table that match the provided filters using the service role.",
  inputSchema: deleteArgs,
}, async (args: DeleteArgs) => {
  const filtered = applyFilters(
    adminClient.from(args.table).delete(),
    args.filters
  );

  const finalQuery =
    args.returning === "representation" ? filtered.select() : filtered;

  const { data, error } = await finalQuery;

  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }

  return responseFromJSON(data ?? null);
});

server.registerTool("supabase.storageUpload", {
  description:
    "Upload a base64-encoded file to the configured storage bucket using the service role.",
  inputSchema: storageArgs,
}, async (args: StorageArgs) => {
  const fileBuffer = Buffer.from(args.base64, "base64");

  const { error } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .upload(args.path, fileBuffer, {
      contentType: args.contentType,
      upsert: args.upsert,
    });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const { data } = adminClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(args.path);

  return responseFromJSON(data);
});

const transport = new StdioServerTransport();

server
  .connect(transport)
  .catch((error: unknown) => {
    console.error("Failed to start Supabase MCP server:", error);
    process.exit(1);
  });
