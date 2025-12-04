'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';
import { updateProfileSchema } from '@/lib/validation/schemas';

import type {
  SimpleSettingsActionState,
  UpdateProfileFormState,
  UpdateProfileFormValues,
} from './form-state';

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function readBoolean(formData: FormData, key: string, fallback = false): boolean {
  const value = formData.get(key);
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

function validateFields(formData: FormData) {
  const fullName = readField(formData, 'fullName');
  const avatarUrl = readField(formData, 'avatarUrl');
  const phone = readField(formData, 'phone');
  const location = readField(formData, 'location');
  const bio = readField(formData, 'bio');
  const notifyMessages = readBoolean(formData, 'notifyMessages', true);
  const notifyOffers = readBoolean(formData, 'notifyOffers', true);
  const notifyUpdates = readBoolean(formData, 'notifyUpdates', true);
  const marketingEmails = readBoolean(formData, 'marketingEmails', false);
  const preferredLanguageRaw = readField(formData, 'preferredLanguage');
  const preferredLanguage = ['en', 'ar', 'ku'].includes(preferredLanguageRaw)
    ? (preferredLanguageRaw as 'en' | 'ar' | 'ku')
    : 'en';

  const candidate = {
    fullName,
    avatarUrl: avatarUrl ? avatarUrl : null,
    phone: phone ? phone : null,
    location: location ? location : null,
    bio: bio ? bio : null,
    notifyMessages,
    notifyOffers,
    notifyUpdates,
    marketingEmails,
    preferredLanguage,
  };

  const result = updateProfileSchema.safeParse(candidate);

  const fieldErrors: UpdateProfileFormState['fieldErrors'] = {};

  if (!result.success) {
    const flattened = result.error.flatten();
    for (const [key, errors] of Object.entries(flattened.fieldErrors)) {
      if (errors && errors.length > 0) {
        fieldErrors[key as keyof UpdateProfileFormValues] = errors;
      }
    }
    const fallbackValues: UpdateProfileFormValues = {
      fullName,
      avatarUrl: avatarUrl ? avatarUrl : null,
      phone: phone ? phone : null,
      location: location ? location : null,
      bio: bio ? bio : null,
      notifyMessages,
      notifyOffers,
      notifyUpdates,
      marketingEmails,
      preferredLanguage,
    };
    return {
      fieldErrors,
      values: fallbackValues,
    };
  }

  return {
    fieldErrors: {},
    values: result.data,
  };
}

export async function updateProfileAction(
  _prevState: UpdateProfileFormState,
  formData: FormData,
): Promise<UpdateProfileFormState> {
  const { fieldErrors, values } = validateFields(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors,
    };
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      status: 'error',
      message: 'You need to be signed in to update your profile.',
      fieldErrors: {},
    };
  }

  const updates = {
    full_name: values.fullName,
    avatar_url: values.avatarUrl || null,
    phone: values.phone || null,
    location: values.location || null,
    bio: values.bio || null,
    notify_messages: values.notifyMessages,
    notify_offers: values.notifyOffers,
    notify_updates: values.notifyUpdates,
    marketing_emails: values.marketingEmails,
    preferred_language: values.preferredLanguage,
    profile_completed:
      Boolean(values.fullName) && Boolean(values.location) && Boolean(values.bio),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update profile settings', error);
    return {
      status: 'error',
      message: 'We could not save your profile right now. Please try again later.',
      fieldErrors: {},
    };
  }

  revalidatePath('/profile');

  return {
    status: 'success',
    message: 'Profile updated successfully.',
    fieldErrors: {},
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function requestEmailChangeAction(
  _prev: SimpleSettingsActionState,
  formData: FormData,
): Promise<SimpleSettingsActionState> {
  const newEmail = readField(formData, 'newEmail');

  if (!newEmail || !isValidEmail(newEmail)) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: 'error', message: 'You need to be signed in to update your email.' };
  }

  if (user.email && user.email.toLowerCase() === newEmail.toLowerCase()) {
    return { status: 'error', message: 'This email is already associated with your account.' };
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) {
    console.error('Failed to update email', error);
    return { status: 'error', message: error.message ?? 'Unable to update email right now.' };
  }

  return {
    status: 'success',
    message: 'Verification link sent. Please check your inbox to confirm the new email.',
  };
}

export async function changePasswordAction(
  _prev: SimpleSettingsActionState,
  formData: FormData,
): Promise<SimpleSettingsActionState> {
  const newPassword = readField(formData, 'newPassword');
  const confirmPassword = readField(formData, 'confirmPassword');

  if (newPassword.length < 8) {
    return { status: 'error', message: 'Password must be at least 8 characters long.' };
  }

  if (newPassword !== confirmPassword) {
    return { status: 'error', message: 'Passwords do not match.' };
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: 'error', message: 'You need to be signed in to update your password.' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    console.error('Failed to update password', error);
    const requiresReauth = /reauth/i.test(error.message ?? '');
    return {
      status: 'error',
      message: requiresReauth
        ? 'Please reauthenticate (sign out and back in) before updating your password.'
        : error.message ?? 'Unable to update password right now.',
    };
  }

  return {
    status: 'success',
    message: 'Password updated. You may need to sign in again on other devices.',
  };
}
