'use client';

import { useEffect, useMemo, useId } from 'react';
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

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul id={id} className="space-y-1 text-sm text-destructive" role="alert">
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
  const formKey = useMemo(() => JSON.stringify(initialValues), [initialValues]);
  const fullNameErrorsId = useId();
  const phoneErrorsId = useId();
  const locationErrorsId = useId();
  const bioErrorsId = useId();

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
    <form key={formKey} action={formAction} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={initialValues.fullName}
          placeholder="Jane Doe"
          aria-invalid={state.fieldErrors?.fullName ? 'true' : 'false'}
          aria-describedby={state.fieldErrors?.fullName ? fullNameErrorsId : undefined}
          autoComplete="name"
          required
        />
        <FieldErrors id={fullNameErrorsId} errors={state.fieldErrors?.fullName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={initialValues.phone ?? ''}
          placeholder="+964 750 000 0000"
          aria-invalid={state.fieldErrors?.phone ? 'true' : 'false'}
          aria-describedby={state.fieldErrors?.phone ? phoneErrorsId : undefined}
          autoComplete="tel"
        />
        <FieldErrors id={phoneErrorsId} errors={state.fieldErrors?.phone} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={initialValues.location ?? ''}
          placeholder="Erbil, Kurdistan"
          aria-invalid={state.fieldErrors?.location ? 'true' : 'false'}
          aria-describedby={state.fieldErrors?.location ? locationErrorsId : undefined}
          autoComplete="address-level2"
        />
        <FieldErrors id={locationErrorsId} errors={state.fieldErrors?.location} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={initialValues.bio ?? ''}
          placeholder="Tell buyers a little about yourself."
          rows={4}
          aria-invalid={state.fieldErrors?.bio ? 'true' : 'false'}
          aria-describedby={state.fieldErrors?.bio ? bioErrorsId : undefined}
        />
        <FieldErrors id={bioErrorsId} errors={state.fieldErrors?.bio} />
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
