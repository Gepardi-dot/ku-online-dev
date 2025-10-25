export type UpdateProfileFormValues = {
  fullName: string;
  phone: string | null;
  location: string | null;
  bio: string | null;
  preferredLanguage: 'en' | 'ar' | 'ku';
  profileVisibility: 'public' | 'community' | 'private';
  showProfileOnMarketplace: boolean;
  notifyMessages: boolean;
  notifyOffers: boolean;
  notifyUpdates: boolean;
  marketingEmails: boolean;
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
