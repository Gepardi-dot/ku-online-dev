'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';
import { updateProfileSchema } from '@/lib/validation/schemas';

import type { UpdateProfileFormState, UpdateProfileFormValues } from './form-state';

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
