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
import { useLocale } from '@/providers/locale-provider';

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
  const { t, messages } = useLocale();

  const [notifyMessages, setNotifyMessages] = useState(initialValues.notifyMessages);
  const [notifyOffers, setNotifyOffers] = useState(initialValues.notifyOffers);
  const [notifyUpdates, setNotifyUpdates] = useState(initialValues.notifyUpdates);
  const [marketingEmails, setMarketingEmails] = useState(initialValues.marketingEmails);
  const [preferredLanguage, setPreferredLanguage] = useState(initialValues.preferredLanguage ?? 'en');

  useEffect(() => {
    if (state.status === 'success') {
      toast({
        title: t('profile.settingsPanel.preferencesUpdatedTitle'),
        description: state.message || t('profile.settingsPanel.preferencesUpdatedDescription'),
      });
    }
    if (state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length === 0) {
      toast({
        title: t('profile.settingsPanel.preferencesErrorTitle'),
        description: state.message,
        variant: 'destructive',
      });
    }
  }, [state, toast, t]);

  const hasGlobalError =
    state.status === 'error' && state.message && Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.settingsPanel.notificationsTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('profile.settingsPanel.notificationsDescription')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow
              label={t('profile.settingsPanel.toggles.messageAlerts.title')}
              description={t('profile.settingsPanel.toggles.messageAlerts.description')}
              checked={notifyMessages}
              onCheckedChange={setNotifyMessages}
              name="notifyMessages"
            />
            <ToggleRow
              label={t('profile.settingsPanel.toggles.offerActivity.title')}
              description={t('profile.settingsPanel.toggles.offerActivity.description')}
              checked={notifyOffers}
              onCheckedChange={setNotifyOffers}
              name="notifyOffers"
            />
            <ToggleRow
              label={t('profile.settingsPanel.toggles.listingUpdates.title')}
              description={t('profile.settingsPanel.toggles.listingUpdates.description')}
              checked={notifyUpdates}
              onCheckedChange={setNotifyUpdates}
              name="notifyUpdates"
            />
            <ToggleRow
              label={t('profile.settingsPanel.toggles.marketingEmails.title')}
              description={t('profile.settingsPanel.toggles.marketingEmails.description')}
              checked={marketingEmails}
              onCheckedChange={setMarketingEmails}
              name="marketingEmails"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.settingsPanel.languageTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('profile.settingsPanel.languageDescription')}
            </p>
          </CardHeader>
          <CardContent className="max-w-xs space-y-2">
            <Label htmlFor="preferredLanguage">{t('profile.settingsPanel.languageLabel')}</Label>
            <Select
              value={preferredLanguage}
              onValueChange={(value) => setPreferredLanguage(value as 'en' | 'ar' | 'ku')}
            >
              <SelectTrigger id="preferredLanguage">
                <SelectValue placeholder={t('profile.settingsPanel.languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{messages.languageNames.en}</SelectItem>
                <SelectItem value="ar">{messages.languageNames.ar}</SelectItem>
                <SelectItem value="ku">{messages.languageNames.ku}</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="preferredLanguage" value={preferredLanguage} />
          </CardContent>
        </Card>

        <div className="flex flex-col items-end gap-2">
          <SubmitButton
            label={t('profile.settingsPanel.save')}
            pendingLabel={t('profile.settingsPanel.saving')}
          />
          {hasGlobalError ? <p className="text-sm text-destructive">{state.message}</p> : null}
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.settingsPanel.accountEmailTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('profile.settingsPanel.accountEmailDescription').replace('{email}', currentEmail)}
          </p>
        </CardHeader>
        <CardContent>
          <form action={emailAction} className="space-y-3 max-w-md">
            <Input
              type="email"
              name="newEmail"
              placeholder={t('profile.settingsPanel.accountEmailPlaceholder')}
              required
            />
            <div className="flex items-center gap-3">
              <NamedSubmitButton
                label={t('profile.settingsPanel.sendConfirmation')}
                pendingLabel={t('profile.settingsPanel.sendingConfirmation')}
              />
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
          <CardTitle>{t('profile.settingsPanel.passwordTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('profile.settingsPanel.passwordDescription')}
          </p>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="space-y-3 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('profile.settingsPanel.newPasswordLabel')}</Label>
              <Input type="password" name="newPassword" id="newPassword" minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('profile.settingsPanel.confirmPasswordLabel')}</Label>
              <Input type="password" name="confirmPassword" id="confirmPassword" minLength={8} required />
            </div>
            <div className="flex items-center gap-3">
              <NamedSubmitButton
                label={t('profile.settingsPanel.updatePassword')}
                pendingLabel={t('profile.settingsPanel.updatingPassword')}
              />
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
          <CardTitle className="text-destructive">{t('profile.settingsPanel.dangerZoneTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('profile.settingsPanel.dangerZoneDescription')}</p>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              if (!confirm(t('profile.settingsPanel.deleteConfirm'))) return;
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
                toast({
                  title: t('profile.settingsPanel.deleteFailedTitle'),
                  description: t('profile.settingsPanel.deleteFailedDescription'),
                  variant: 'destructive',
                });
              }
            }}
          >
            {t('profile.settingsPanel.deleteAccount')}
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

function SubmitButton({
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
