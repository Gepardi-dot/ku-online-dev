export type UpdateProfileFormValues = {
  fullName: string;
  avatarUrl?: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  notifyMessages: boolean;
  notifyOffers: boolean;
  notifyUpdates: boolean;
  notifyAnnouncements: boolean;
  marketingEmails: boolean;
  preferredLanguage: 'en' | 'ar' | 'ku';
};

export type UpdateProfileFormState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  fieldErrors: Partial<Record<keyof UpdateProfileFormValues, string[]>>;
};

export const UPDATE_PROFILE_INITIAL_STATE: UpdateProfileFormState = {
  status: 'idle',
  message: null,
  fieldErrors: {},
};

export type SimpleSettingsActionState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
};

export const SIMPLE_SETTINGS_INITIAL_STATE: SimpleSettingsActionState = {
  status: 'idle',
  message: null,
};
