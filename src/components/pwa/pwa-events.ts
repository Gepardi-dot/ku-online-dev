export type PwaEventDetailValue = string | number | boolean | null;

export type PwaEventDetail = Record<string, PwaEventDetailValue>;

export const PWA_TELEMETRY_EVENTS = {
  ROLLOUT_ENABLED: 'ku-pwa-rollout-enabled',
  ROLLOUT_DISABLED: 'ku-pwa-rollout-disabled',
  INSTALL_PROMPT_SHOWN: 'ku-pwa-install-prompt-shown',
  INSTALL_CTA_CLICKED: 'ku-pwa-install-cta-clicked',
  INSTALL_GUIDE_OPENED: 'ku-pwa-install-guide-opened',
  INSTALL_MINIMIZED: 'ku-pwa-install-minimized',
  INSTALL_VARIANT_CONTROL_SHOWN: 'ku-pwa-install-variant-control-shown',
  INSTALL_VARIANT_SPOTLIGHT_SHOWN: 'ku-pwa-install-variant-spotlight-shown',
  INSTALL_VARIANT_CONTROL_CTA_CLICKED: 'ku-pwa-install-variant-control-cta-clicked',
  INSTALL_VARIANT_SPOTLIGHT_CTA_CLICKED: 'ku-pwa-install-variant-spotlight-cta-clicked',
  INSTALL_VARIANT_CONTROL_ACCEPTED: 'ku-pwa-install-variant-control-accepted',
  INSTALL_VARIANT_SPOTLIGHT_ACCEPTED: 'ku-pwa-install-variant-spotlight-accepted',
  INSTALL_ACCEPTED: 'ku-pwa-install-accepted',
  INSTALL_DISMISSED: 'ku-pwa-install-dismissed',
  PUSH_PROMPT_SHOWN: 'ku-pwa-push-prompt-shown',
  PUSH_ENABLED: 'ku-pwa-push-enabled',
  PUSH_DISMISSED: 'ku-pwa-push-dismissed',
  PUSH_PERMISSION_DENIED: 'ku-pwa-push-permission-denied',
  PUSH_ENABLE_FAILED: 'ku-pwa-push-enable-failed',
} as const;

export type PwaTelemetryEventName =
  (typeof PWA_TELEMETRY_EVENTS)[keyof typeof PWA_TELEMETRY_EVENTS];

export function dispatchPwaTelemetryEvent(
  eventName: PwaTelemetryEventName,
  detail?: PwaEventDetail,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}
