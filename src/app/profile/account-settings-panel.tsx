'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

import { changePasswordAction, requestEmailChangeAction, updateProfileAction } from './actions';
import {
  SIMPLE_SETTINGS_INITIAL_STATE,
  UPDATE_PROFILE_INITIAL_STATE,
  type UpdateProfileFormState,
  type UpdateProfileFormValues,
} from './form-state';

type Props = {
  initialValues: UpdateProfileFormValues;
  currentEmail: string;
};

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name: string;
};

export default function AccountSettingsPanel({ initialValues, currentEmail }: Props) {
  const [state, formAction] = useActionState<UpdateProfileFormState, FormData>(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );
  const [emailState, emailAction] = useActionState(requestEmailChangeAction, SIMPLE_SETTINGS_INITIAL_STATE);
  const [passwordState, passwordAction] = useActionState(changePasswordAction, SIMPLE_SETTINGS_INITIAL_STATE);
  const { toast } = useToast();

  const [notifyMessages, setNotifyMessages] = useState(initialValues.notifyMessages);
  const [notifyOffers, setNotifyOffers] = useState(initialValues.notifyOffers);
  const [notifyUpdates, setNotifyUpdates] = useState(initialValues.notifyUpdates);
  const [marketingEmails, setMarketingEmails] = useState(initialValues.marketingEmails);
  const [preferredLanguage, setPreferredLanguage] = useState(initialValues.preferredLanguage ?? 'en');

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast({ title: 'Preferences updated', description: state.message });
    }
    if (state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length === 0) {
      toast({ title: 'Update failed', description: state.message, variant: 'destructive' });
    }
  }, [state, toast]);

  const hasGlobalError =
    state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <p className="text-sm text-muted-foreground">Choose how we keep you informed.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow
              label="Message alerts"
              description="Receive instant notifications when buyers contact you."
              checked={notifyMessages}
              onCheckedChange={setNotifyMessages}
              name="notifyMessages"
            />
            <ToggleRow
              label="Offer activity"
              description="Stay updated about offers and counter offers on your listings."
              checked={notifyOffers}
              onCheckedChange={setNotifyOffers}
              name="notifyOffers"
            />
            <ToggleRow
              label="Listing updates"
              description="Get alerts about expiring or promoted listings."
              checked={notifyUpdates}
              onCheckedChange={setNotifyUpdates}
              name="notifyUpdates"
            />
            <ToggleRow
              label="Marketing emails"
              description="Occasional tips, promos, and marketplace news."
              checked={marketingEmails}
              onCheckedChange={setMarketingEmails}
              name="marketingEmails"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Language</CardTitle>
            <p className="text-sm text-muted-foreground">Controls the default language across the app.</p>
          </CardHeader>
          <CardContent className="max-w-xs space-y-2">
            <Label htmlFor="preferredLanguage">Preferred language</Label>
            <Select
              value={preferredLanguage}
              onValueChange={(value) => setPreferredLanguage(value as 'en' | 'ar' | 'ku')}
            >
              <SelectTrigger id="preferredLanguage">
                <SelectValue placeholder="Choose a language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="ku">Kurdî</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="preferredLanguage" value={preferredLanguage} />
          </CardContent>
        </Card>

        <div className="flex flex-col items-end gap-2">
          <SubmitButton />
          {hasGlobalError ? <p className="text-sm text-destructive">{state.message}</p> : null}
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Account email</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current email: <span className="font-medium text-foreground">{currentEmail}</span>. We’ll send a confirmation
            link to the new address.
          </p>
        </CardHeader>
        <CardContent>
          <form action={emailAction} className="space-y-3 max-w-md">
            <Input type="email" name="newEmail" placeholder="new-email@example.com" required />
            <div className="flex items-center gap-3">
              <NamedSubmitButton label="Send confirmation" pendingLabel="Sending..." />
              {emailState.message ? (
                <p
                  className={`text-sm ${
                    emailState.status === 'success' ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {emailState.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <p className="text-sm text-muted-foreground">Use a strong password that you don’t reuse elsewhere.</p>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="space-y-3 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input type="password" name="newPassword" id="newPassword" minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input type="password" name="confirmPassword" id="confirmPassword" minLength={8} required />
            </div>
            <div className="flex items-center gap-3">
              <NamedSubmitButton label="Update password" pendingLabel="Updating..." />
              {passwordState.message ? (
                <p
                  className={`text-sm ${
                    passwordState.status === 'success' ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {passwordState.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <p className="text-sm text-muted-foreground">Permanently delete your account and marketplace data.</p>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              if (!confirm('This will permanently delete your account. Continue?')) return;
              try {
                const res = await fetch('/api/account/delete', {
                  method: 'POST',
                  headers: { 'x-reconfirm': 'delete' },
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(body?.error || 'Failed to delete account');
                }
                window.location.href = '/';
              } catch (err) {
                console.error('Delete account failed', err);
                toast({ title: 'Delete failed', description: 'Please try again shortly.', variant: 'destructive' });
              }
            }}
          >
            Delete my account
          </Button>
        </CardContent>
      </Card>
    </div>
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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

function NamedSubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
