'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import { updateProfileAction } from './actions';
import {
  UPDATE_PROFILE_INITIAL_STATE,
  type UpdateProfileFormState,
  type UpdateProfileFormValues,
} from './form-state';

type ProfileSettingsFormProps = {
  initialValues: UpdateProfileFormValues;
};

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-sm text-destructive">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

export default function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const [state, formAction] = useFormState<UpdateProfileFormState, FormData>(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast({
        title: 'Profile updated',
        description: state.message,
      });
    }

    if (state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length === 0) {
      toast({
        title: 'Profile update failed',
        description: state.message,
        variant: 'destructive',
      });
    }
  }, [state, toast]);

  const hasGlobalError =
    state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={initialValues.fullName}
          placeholder="Jane Doe"
          required
        />
        <FieldErrors errors={state.fieldErrors?.fullName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={initialValues.phone ?? ''}
          placeholder="+964 750 000 0000"
        />
        <FieldErrors errors={state.fieldErrors?.phone} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={initialValues.location ?? ''}
          placeholder="Erbil, Kurdistan"
        />
        <FieldErrors errors={state.fieldErrors?.location} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={initialValues.bio ?? ''}
          placeholder="Tell buyers a little about yourself."
          rows={4}
        />
        <FieldErrors errors={state.fieldErrors?.bio} />
      </div>

      {state.status === 'success' && state.message ? (
        <p className="text-sm text-green-600">{state.message}</p>
      ) : null}

      {hasGlobalError ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
