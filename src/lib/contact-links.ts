export type WhatsAppTargets = {
  appHref: string;
  webHref: string;
};

function normalizeWhatsappPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!digits) return null;
  const normalized = digits.startsWith('+') ? digits.slice(1) : digits;
  return normalized || null;
}

export function toTelHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `tel:${trimmed}`;
}

export function toWhatsAppTargets(value: string | null | undefined): WhatsAppTargets | null {
  const phone = normalizeWhatsappPhone(value);
  if (!phone) return null;
  const encodedPhone = encodeURIComponent(phone);
  return {
    appHref: `whatsapp://send?phone=${encodedPhone}`,
    webHref: `https://wa.me/${encodedPhone}`,
  };
}

export function appendWhatsAppText(href: string, message: string): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}text=${encodeURIComponent(message)}`;
}
