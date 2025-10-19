'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';

import type { UpdateProfileFormState } from './form-state';

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function validateFields(formData: FormData) {
  const fullName = readField(formData, 'fullName');
  const phone = readField(formData, 'phone');
  const location = readField(formData, 'location');
  const bio = readField(formData, 'bio');

  const fieldErrors: UpdateProfileFormState['fieldErrors'] = {};

  if (!fullName) {
    fieldErrors.fullName = ['Full name is required.'];
  } else if (fullName.length < 2) {
    fieldErrors.fullName = ['Full name must be at least 2 characters long.'];
  } else if (fullName.length > 120) {
    fieldErrors.fullName = ['Full name must be 120 characters or fewer.'];
  }

  if (phone) {
    const phonePattern = /^[+0-9()\-\s]{6,20}$/;
    if (!phonePattern.test(phone)) {
      fieldErrors.phone = ['Enter a valid phone number.'];
    }
  }

  if (location && location.length > 120) {
    fieldErrors.location = ['Location must be 120 characters or fewer.'];
  }

  if (bio && bio.length > 500) {
    fieldErrors.bio = ['Bio must be 500 characters or fewer.'];
  }

  return {
    fieldErrors,
    values: {
      fullName,
      phone,
      location,
      bio,
    },
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

  const cookieStore = cookies();
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
    id: user.id,
    full_name: values.fullName,
    phone: values.phone || null,
    location: values.location || null,
    bio: values.bio || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('users')
    .upsert(updates, { onConflict: 'id' });

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
