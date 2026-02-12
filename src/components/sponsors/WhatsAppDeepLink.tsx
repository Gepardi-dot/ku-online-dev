'use client';

import * as React from 'react';

const DEFAULT_FALLBACK_DELAY_MS = 1100;

type WhatsAppDeepLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  appHref: string | null;
  webHref: string | null;
  disabled?: boolean;
  fallbackDelayMs?: number;
};

export const WhatsAppDeepLink = React.forwardRef<HTMLAnchorElement, WhatsAppDeepLinkProps>(function WhatsAppDeepLink(
  { appHref, webHref, disabled = false, fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS, onClick, ...props },
  ref,
) {
  const isDisabled = disabled || !webHref;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (isDisabled) {
      event.preventDefault();
      return;
    }

    if (!appHref || !webHref) {
      return;
    }

    event.preventDefault();

    let timeoutId = 0;
    let shouldFallback = true;

    const cleanup = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      window.removeEventListener('pagehide', onPageHide, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        shouldFallback = false;
        cleanup();
      }
    };

    const onPageHide = () => {
      shouldFallback = false;
      cleanup();
    };

    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('pagehide', onPageHide, true);

    timeoutId = window.setTimeout(() => {
      cleanup();
      if (shouldFallback) {
        window.location.assign(webHref);
      }
    }, fallbackDelayMs);

    try {
      window.location.assign(appHref);
    } catch {
      cleanup();
      window.location.assign(webHref);
    }
  };

  return (
    <a
      ref={ref}
      href={webHref ?? '#'}
      onClick={handleClick}
      aria-disabled={isDisabled ? true : undefined}
      {...props}
    />
  );
});
