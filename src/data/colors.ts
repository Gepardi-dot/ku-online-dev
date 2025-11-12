export type ColorToken =
  | 'black'
  | 'white'
  | 'gray'
  | 'silver'
  | 'gold'
  | 'blue'
  | 'red'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'beige'
  | 'navy'
  | 'teal'
  | 'rose'
  | 'graphite'
  | 'midnight'
  | 'starlight'
  | 'other';

export type ColorOption = {
  token: ColorToken;
  hex: string;
  label: string; // English label; localize at render if desired
};

export const COLOR_OPTIONS: ColorOption[] = [
  { token: 'black', hex: '#000000', label: 'Black' },
  { token: 'white', hex: '#FFFFFF', label: 'White' },
  { token: 'gray', hex: '#8E8E93', label: 'Gray' },
  { token: 'silver', hex: '#C0C0C0', label: 'Silver' },
  { token: 'gold', hex: '#D4AF37', label: 'Gold' },
  { token: 'blue', hex: '#1E90FF', label: 'Blue' },
  { token: 'red', hex: '#E53935', label: 'Red' },
  { token: 'green', hex: '#43A047', label: 'Green' },
  { token: 'yellow', hex: '#FDD835', label: 'Yellow' },
  { token: 'orange', hex: '#FB8C00', label: 'Orange' },
  { token: 'purple', hex: '#8E24AA', label: 'Purple' },
  { token: 'pink', hex: '#E91E63', label: 'Pink' },
  { token: 'brown', hex: '#795548', label: 'Brown' },
  { token: 'beige', hex: '#E6D8B9', label: 'Beige' },
  { token: 'navy', hex: '#001F3F', label: 'Navy' },
  { token: 'teal', hex: '#00897B', label: 'Teal' },
  { token: 'rose', hex: '#F8BBD0', label: 'Rose' },
  { token: 'graphite', hex: '#4A4A4A', label: 'Graphite' },
  { token: 'midnight', hex: '#0A0F29', label: 'Midnight' },
  { token: 'starlight', hex: '#F5F0E6', label: 'Starlight' },
  { token: 'other', hex: '#9E9E9E', label: 'Other' },
];

export const COLOR_TOKENS = COLOR_OPTIONS.map((c) => c.token);

