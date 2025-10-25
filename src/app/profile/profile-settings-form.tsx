'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name: string;
};

export default function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const [state, formAction] = useFormState<UpdateProfileFormState, FormData>(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );
  const { toast } = useToast();

  const [preferredLanguage, setPreferredLanguage] = useState<UpdateProfileFormValues['preferredLanguage']>(
    initialValues.preferredLanguage,
  );
  const [profileVisibility, setProfileVisibility] = useState<UpdateProfileFormValues['profileVisibility']>(
    initialValues.profileVisibility,
  );
  const [showProfileOnMarketplace, setShowProfileOnMarketplace] = useState(
    initialValues.showProfileOnMarketplace,
  );
  const [notifyMessages, setNotifyMessages] = useState(initialValues.notifyMessages);
  const [notifyOffers, setNotifyOffers] = useState(initialValues.notifyOffers);
  const [notifyUpdates, setNotifyUpdates] = useState(initialValues.notifyUpdates);
  const [marketingEmails, setMarketingEmails] = useState(initialValues.marketingEmails);

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

  useEffect(() => {
    setPreferredLanguage(initialValues.preferredLanguage);
    setProfileVisibility(initialValues.profileVisibility);
    setShowProfileOnMarketplace(initialValues.showProfileOnMarketplace);
    setNotifyMessages(initialValues.notifyMessages);
    setNotifyOffers(initialValues.notifyOffers);
    setNotifyUpdates(initialValues.notifyUpdates);
    setMarketingEmails(initialValues.marketingEmails);
  }, [initialValues]);

  const hasGlobalError =
    state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <form action={formAction} className="space-y-10" id="profile-settings-form">
      <section id="profile-details" className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Profile details</h3>
          <p className="text-sm text-muted-foreground">
            Update what buyers see on your storefront and how they can reach you.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
            <Label htmlFor="preferredLanguage">Preferred language</Label>
            <Select
              value={preferredLanguage}
              onValueChange={(value) =>
                setPreferredLanguage(value as UpdateProfileFormValues['preferredLanguage'])
              }
            >
              <SelectTrigger id="preferredLanguage">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
                <SelectItem value="ku">Kurdish</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="preferredLanguage" value={preferredLanguage} />
            <FieldErrors errors={state.fieldErrors?.preferredLanguage} />
          </div>
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
      </section>

      <Separator />

      <section className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Visibility & discoverability</h3>
          <p className="text-sm text-muted-foreground">
            Control how your profile appears across the marketplace.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profileVisibility">Profile visibility</Label>
            <Select
              value={profileVisibility}
              onValueChange={(value) =>
                setProfileVisibility(value as UpdateProfileFormValues['profileVisibility'])
              }
            >
              <SelectTrigger id="profileVisibility">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="community">Community only</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="profileVisibility" value={profileVisibility} />
            <FieldErrors errors={state.fieldErrors?.profileVisibility} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="pr-4">
              <p className="text-sm font-medium text-foreground">Show profile in marketplace</p>
              <p className="text-xs text-muted-foreground">
                Allow buyers to discover you in search and category pages.
              </p>
            </div>
            <Switch
              checked={showProfileOnMarketplace}
              onCheckedChange={setShowProfileOnMarketplace}
              aria-label="Show profile on marketplace"
            />
          </div>
          <input
            type="hidden"
            name="showProfileOnMarketplace"
            value={showProfileOnMarketplace ? 'true' : 'false'}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Choose how we keep you informed about marketplace activity.
          </p>
        </div>

        <div className="space-y-4">
          <ToggleRow
            label="Messages"
            description="Alerts when buyers contact you about a listing."
            checked={notifyMessages}
            onCheckedChange={setNotifyMessages}
            name="notifyMessages"
          />
          <ToggleRow
            label="Offers"
            description="Notifications for new offers and counter-offers."
            checked={notifyOffers}
            onCheckedChange={setNotifyOffers}
            name="notifyOffers"
          />
          <ToggleRow
            label="Listing updates"
            description="Updates on listing approvals, expirations, or disputes."
            checked={notifyUpdates}
            onCheckedChange={setNotifyUpdates}
            name="notifyUpdates"
          />
          <ToggleRow
            label="Marketing emails"
            description="Occasional tips, campaigns, and marketplace announcements."
            checked={marketingEmails}
            onCheckedChange={setMarketingEmails}
            name="marketingEmails"
          />
        </div>
      </section>

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

function ToggleRow({ label, description, checked, onCheckedChange, name }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      <input type="hidden" name={name} value={checked ? 'true' : 'false'} />
    </div>
  );
}

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
