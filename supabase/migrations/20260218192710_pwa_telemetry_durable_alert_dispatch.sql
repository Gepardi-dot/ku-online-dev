create sequence "public"."pwa_slo_alert_dispatches_id_seq";

create sequence "public"."pwa_telemetry_events_id_seq";


  create table "public"."pwa_slo_alert_dispatches" (
    "id" bigint not null default nextval('public.pwa_slo_alert_dispatches_id_seq'::regclass),
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "fingerprint" text not null,
    "delivery_status" text not null,
    "summary_status" text not null,
    "alert_count" integer not null default 0,
    "window_minutes" integer not null,
    "display_mode" text not null,
    "path_prefix" text,
    "payload" jsonb not null default '{}'::jsonb,
    "triggered_by" text not null default 'system'::text,
    "delivery_error" text
      );


alter table "public"."pwa_slo_alert_dispatches" enable row level security;


  create table "public"."pwa_telemetry_events" (
    "id" bigint not null default nextval('public.pwa_telemetry_events_id_seq'::regclass),
    "event_type" text not null,
    "name" text not null,
    "event_ts" timestamp with time zone not null,
    "path" text not null,
    "value" double precision,
    "rating" text,
    "display_mode" text not null default 'unknown'::text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."pwa_telemetry_events" enable row level security;

alter sequence "public"."pwa_slo_alert_dispatches_id_seq" owned by "public"."pwa_slo_alert_dispatches"."id";

alter sequence "public"."pwa_telemetry_events_id_seq" owned by "public"."pwa_telemetry_events"."id";

CREATE INDEX idx_pwa_slo_alert_dispatches_created_at_desc ON public.pwa_slo_alert_dispatches USING btree (created_at DESC);

CREATE INDEX idx_pwa_slo_alert_dispatches_delivery_status_created_at ON public.pwa_slo_alert_dispatches USING btree (delivery_status, created_at DESC);

CREATE INDEX idx_pwa_slo_alert_dispatches_fingerprint_created_at ON public.pwa_slo_alert_dispatches USING btree (fingerprint, created_at DESC);

CREATE INDEX idx_pwa_telemetry_events_display_mode_event_ts ON public.pwa_telemetry_events USING btree (display_mode, event_ts DESC);

CREATE INDEX idx_pwa_telemetry_events_event_ts_desc ON public.pwa_telemetry_events USING btree (event_ts DESC);

CREATE INDEX idx_pwa_telemetry_events_path_pattern ON public.pwa_telemetry_events USING btree (path text_pattern_ops);

CREATE INDEX idx_pwa_telemetry_events_type_name_event_ts ON public.pwa_telemetry_events USING btree (event_type, name, event_ts DESC);

CREATE UNIQUE INDEX pwa_slo_alert_dispatches_pkey ON public.pwa_slo_alert_dispatches USING btree (id);

CREATE UNIQUE INDEX pwa_telemetry_events_pkey ON public.pwa_telemetry_events USING btree (id);

alter table "public"."pwa_slo_alert_dispatches" add constraint "pwa_slo_alert_dispatches_pkey" PRIMARY KEY using index "pwa_slo_alert_dispatches_pkey";

alter table "public"."pwa_telemetry_events" add constraint "pwa_telemetry_events_pkey" PRIMARY KEY using index "pwa_telemetry_events_pkey";

alter table "public"."pwa_slo_alert_dispatches" add constraint "pwa_slo_alert_dispatches_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped_pass'::text, 'skipped_duplicate'::text, 'skipped_config'::text]))) not valid;

alter table "public"."pwa_slo_alert_dispatches" validate constraint "pwa_slo_alert_dispatches_delivery_status_check";

alter table "public"."pwa_slo_alert_dispatches" add constraint "pwa_slo_alert_dispatches_display_mode_check" CHECK ((display_mode = ANY (ARRAY['all'::text, 'browser'::text, 'standalone'::text, 'unknown'::text]))) not valid;

alter table "public"."pwa_slo_alert_dispatches" validate constraint "pwa_slo_alert_dispatches_display_mode_check";

alter table "public"."pwa_slo_alert_dispatches" add constraint "pwa_slo_alert_dispatches_summary_status_check" CHECK ((summary_status = ANY (ARRAY['pass'::text, 'warn'::text, 'fail'::text]))) not valid;

alter table "public"."pwa_slo_alert_dispatches" validate constraint "pwa_slo_alert_dispatches_summary_status_check";

alter table "public"."pwa_telemetry_events" add constraint "pwa_telemetry_events_display_mode_check" CHECK ((display_mode = ANY (ARRAY['browser'::text, 'standalone'::text, 'unknown'::text]))) not valid;

alter table "public"."pwa_telemetry_events" validate constraint "pwa_telemetry_events_display_mode_check";

alter table "public"."pwa_telemetry_events" add constraint "pwa_telemetry_events_event_type_check" CHECK ((event_type = ANY (ARRAY['web_vital'::text, 'pwa_lifecycle'::text]))) not valid;

alter table "public"."pwa_telemetry_events" validate constraint "pwa_telemetry_events_event_type_check";

alter table "public"."pwa_telemetry_events" add constraint "pwa_telemetry_events_rating_check" CHECK ((rating = ANY (ARRAY['good'::text, 'needs-improvement'::text, 'poor'::text]))) not valid;

alter table "public"."pwa_telemetry_events" validate constraint "pwa_telemetry_events_rating_check";

revoke all on table "public"."pwa_slo_alert_dispatches" from "anon";
revoke all on table "public"."pwa_slo_alert_dispatches" from "authenticated";
revoke all on sequence "public"."pwa_slo_alert_dispatches_id_seq" from "anon";
revoke all on sequence "public"."pwa_slo_alert_dispatches_id_seq" from "authenticated";
grant select, insert on table "public"."pwa_slo_alert_dispatches" to "service_role";
grant usage, select on sequence "public"."pwa_slo_alert_dispatches_id_seq" to "service_role";

revoke all on table "public"."pwa_telemetry_events" from "anon";
revoke all on table "public"."pwa_telemetry_events" from "authenticated";
revoke all on sequence "public"."pwa_telemetry_events_id_seq" from "anon";
revoke all on sequence "public"."pwa_telemetry_events_id_seq" from "authenticated";
grant select, insert, delete on table "public"."pwa_telemetry_events" to "service_role";
grant usage, select on sequence "public"."pwa_telemetry_events_id_seq" to "service_role";
