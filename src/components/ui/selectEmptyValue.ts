export function toOption(value: string, empty = "any"): string {
  return value && value.length > 0 ? value : empty;
}

export function fromOption(value: string, empty = "any"): string {
  return value === empty ? "" : value;
}

export function toOptionAll(value: string): string {
  return toOption(value, "all");
}

export function fromOptionAll(value: string): string {
  return fromOption(value, "all");
}
