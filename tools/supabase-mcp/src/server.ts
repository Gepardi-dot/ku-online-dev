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

const selectShape = {
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
} satisfies Record<string, z.ZodTypeAny>;

const selectSchema = z.object(selectShape);
type SelectArgs = z.infer<typeof selectSchema>;

const recordValueSchema = z.record(z.string(), z.any());

const insertShape = {
  table: z.string().min(1),
  values: z.union([z.array(recordValueSchema), recordValueSchema]),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} satisfies Record<string, z.ZodTypeAny>;

const insertSchema = z.object(insertShape);
type InsertArgs = z.infer<typeof insertSchema>;

const updateShape = {
  table: z.string().min(1),
  values: recordValueSchema,
  filters: z.array(filterSchema).min(1),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} satisfies Record<string, z.ZodTypeAny>;

const updateSchema = z.object(updateShape);
type UpdateArgs = z.infer<typeof updateSchema>;

const deleteShape = {
  table: z.string().min(1),
  filters: z.array(filterSchema).min(1),
  returning: z.enum(["representation", "minimal"]).default("representation"),
} satisfies Record<string, z.ZodTypeAny>;

const deleteSchema = z.object(deleteShape);
type DeleteArgs = z.infer<typeof deleteSchema>;

const storageShape = {
  path: z.string().min(1),
  base64: z.string().min(1),
  contentType: z.string().default("application/octet-stream"),
  upsert: z.boolean().default(false),
} satisfies Record<string, z.ZodTypeAny>;

const storageSchema = z.object(storageShape);
type StorageArgs = z.infer<typeof storageSchema>;

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
  inputSchema: selectShape as z.ZodRawShape,
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
  inputSchema: insertShape as z.ZodRawShape,
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
  inputSchema: updateShape as z.ZodRawShape,
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
  inputSchema: deleteShape as z.ZodRawShape,
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
  inputSchema: storageShape as z.ZodRawShape,
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
