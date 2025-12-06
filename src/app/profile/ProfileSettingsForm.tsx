"use client";

import {
  useEffect,
  useActionState,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  updateProfileAction,
} from "./actions";
import {
  UPDATE_PROFILE_INITIAL_STATE,
  type UpdateProfileFormState,
} from "./form-state";
import {
  MARKET_CITY_OPTIONS,
  coerceMarketCitySelection,
  normalizeMarketCityValue,
  type MarketCityValue,
} from "@/data/market-cities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/providers/locale-provider";

type ProfileSettingsFormProps = {
  initialValues: {
    fullName: string;
    location: string;
    phone: string;
    bio: string;
  };
};

export function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const [state = UPDATE_PROFILE_INITIAL_STATE, formAction] = useActionState(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );
  const { t } = useLocale();
  const errors = useMemo<UpdateProfileFormState['fieldErrors']>(
    () => state.fieldErrors ?? {},
    [state.fieldErrors],
  );
  const initialCitySelection = useMemo<MarketCityValue>(() => {
    const normalizedSlug = normalizeMarketCityValue(initialValues.location);
    if (normalizedSlug) {
      return coerceMarketCitySelection(normalizedSlug);
    }

    const raw = (initialValues.location ?? "").trim().toLowerCase();
    if (!raw) {
      return "all";
    }

    const match = MARKET_CITY_OPTIONS.find(
      (option) =>
        option.value !== "all" &&
        (raw === option.value ||
          raw === option.label.toLowerCase() ||
          raw.includes(option.value)),
    );

    return (match?.value ?? "all") as MarketCityValue;
  }, [initialValues.location]);
  const [citySelection, setCitySelection] = useState<MarketCityValue>(initialCitySelection);
  const [isDirty, setIsDirty] = useState(false);
  const getCityLabel = useCallback(
    (value: string) => {
      const key = `header.city.${value.toLowerCase()}`;
      const translated = t(key);
      if (translated !== key) {
        return translated;
      }
      const fallback = MARKET_CITY_OPTIONS.find((option) => option.value === value)?.label;
      return fallback ?? value;
    },
    [t],
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  useEffect(() => {
    setCitySelection(initialCitySelection);
    setIsDirty(false);
  }, [initialCitySelection]);

  useEffect(() => {
    if (state.status === "success") {
      toast({
        title: t("profile.form.updatedTitle"),
        description: t("profile.form.updatedDescription"),
      });
      setIsDirty(false);
    } else if (state.message && Object.keys(errors).length === 0) {
      toast({
        title: t("profile.form.updateFailedTitle"),
        description: state.message,
        variant: "destructive",
      });
    }
  }, [errors, state.message, state.status, t]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="fullName"
          label={t("profile.form.fullNameLabel")}
          defaultValue={initialValues.fullName}
          error={errors.fullName}
          onDirty={markDirty}
          required
        />
        <FormField
          id="location"
          label={t("profile.form.cityLabel")}
          error={errors.location}
          customField={
            <CitySelect
              value={citySelection}
              onValueChange={(nextValue) => {
                setCitySelection(nextValue);
                markDirty();
              }}
              getCityLabel={getCityLabel}
              placeholder={t("profile.form.selectCityPlaceholder")}
            />
          }
        >
          <input
            type="hidden"
            name="location"
            value={citySelection === "all" ? "" : citySelection}
          />
        </FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="phone"
          label={t("profile.form.phoneLabel")}
          defaultValue={initialValues.phone}
          error={errors.phone}
          onDirty={markDirty}
          placeholder={t("profile.form.phonePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">{t("profile.form.bioLabel")}</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={initialValues.bio}
          placeholder={t("profile.form.bioPlaceholder")}
          onChange={(_event) => markDirty()}
          rows={4}
        />
        <FieldError messages={errors.bio} />
        {!initialValues.bio && (
          <p className="text-xs text-muted-foreground">
            {t("profile.form.bioHelper")}
          </p>
        )}
      </div>

      {state.message && state.status !== "success" && Object.keys(errors).length > 0 && (
        <Badge variant="destructive" className="font-normal">
          {state.message}
        </Badge>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton
          canSubmit={isDirty}
          label={t("profile.form.save")}
          pendingLabel={t("profile.form.saving")}
        />
        <p className="text-xs text-muted-foreground">
          {t("profile.form.changesHint")}
        </p>
      </div>
    </form>
  );
}

type FormFieldProps = {
  id: string;
  label: string;
  defaultValue?: string;
  error?: string[];
  required?: boolean;
  placeholder?: string;
  onDirty?: () => void;
  customField?: ReactNode;
  children?: ReactNode;
};

function FormField({
  id,
  label,
  defaultValue = "",
  error,
  required,
  placeholder,
  onDirty,
  customField,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {customField ?? (
        <Input
          id={id}
          name={id}
          defaultValue={defaultValue}
          required={required}
          placeholder={placeholder}
          onChange={(_event) => onDirty?.()}
        />
      )}
      {children}
      <FieldError messages={error} />
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-xs text-destructive" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function SubmitButton({
  canSubmit,
  label,
  pendingLabel,
}: {
  canSubmit: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !canSubmit}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function CitySelect({
  value,
  onValueChange,
  getCityLabel,
  placeholder,
}: {
  value: MarketCityValue;
  onValueChange: (value: MarketCityValue) => void;
  getCityLabel: (value: string) => string;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as MarketCityValue)}>
      <SelectTrigger id="location">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {MARKET_CITY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {getCityLabel(option.value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { UpdateProfileFormState } from "./form-state";
