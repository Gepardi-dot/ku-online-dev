export type UpdateProfileFormState = {
  success: boolean;
  message?: string;
  errors: Partial<Record<'fullName' | 'location' | 'phone' | 'bio', string>>;
};

export const UPDATE_PROFILE_INITIAL_STATE: UpdateProfileFormState = {
  success: false,
  errors: {},
};
