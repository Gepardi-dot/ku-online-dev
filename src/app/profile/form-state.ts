export type UpdateProfileFormValues = {
  fullName: string;
  phone: string | null;
  location: string | null;
  bio: string | null;
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
