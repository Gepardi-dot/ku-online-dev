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
        title: "Profile updated",
        description: "Your profile information has been saved.",
      });
      setIsDirty(false);
    } else if (state.message && Object.keys(errors).length === 0) {
      toast({
        title: "Update failed",
        description: state.message,
        variant: "destructive",
      });
    }
  }, [state.status, state.message, errors]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="fullName"
          label="Full name"
          defaultValue={initialValues.fullName}
          error={errors.fullName}
          onDirty={markDirty}
          required
        />
        <FormField
          id="location"
          label="City"
          error={errors.location}
          customField={
            <CitySelect
              value={citySelection}
              onValueChange={(nextValue) => {
                setCitySelection(nextValue);
                markDirty();
              }}
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
          label="Phone"
          defaultValue={initialValues.phone}
          error={errors.phone}
          onDirty={markDirty}
          placeholder="+964 750 000 0000"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={initialValues.bio}
          placeholder="Tell buyers a little about yourself and the items you sell."
          onChange={(_event) => markDirty()}
          rows={4}
        />
        <FieldError messages={errors.bio} />
        {!initialValues.bio && (
          <p className="text-xs text-muted-foreground">
            Helpful sellers share what they specialise in and how quickly they respond.
          </p>
        )}
      </div>

      {state.message && state.status !== "success" && Object.keys(errors).length > 0 && (
        <Badge variant="destructive" className="font-normal">
          {state.message}
        </Badge>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton canSubmit={isDirty} />
        <p className="text-xs text-muted-foreground">
          Changes apply to your Supabase profile and watchlist for future sessions.
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

function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !canSubmit}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

function CitySelect({
  value,
  onValueChange,
}: {
  value: MarketCityValue;
  onValueChange: (value: MarketCityValue) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as MarketCityValue)}>
      <SelectTrigger id="location">
        <SelectValue placeholder="Select city" />
      </SelectTrigger>
      <SelectContent>
        {MARKET_CITY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { UpdateProfileFormState } from "./form-state";
