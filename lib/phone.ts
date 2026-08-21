import {
  AsYouType,
  parsePhoneNumberFromString,
  type PhoneNumber,
} from "libphonenumber-js";

export const DEFAULT_REGION = "MR";
export const COUNTRY_CODE = 222;
export const PLACEHOLDER = "+222 00 00 00 00";

export type PhoneValidation = {
  valid: boolean;
  /** Normalized E.164 form, e.g. +22222123456. */
  e164?: string;
  error?: string;
};

/**
 * Validates a Mauritanian phone number. Accepts raw local digits
 * (22 12 34 56) or international forms (+222 22 12 34 56).
 */
export function validatePhone(raw: string): PhoneValidation {
  const input = (raw ?? "").trim();
  if (!input) {
    return { valid: false, error: "Phone number is required" };
  }

  let parsed: PhoneNumber | undefined;
  try {
    parsed = parsePhoneNumberFromString(input, DEFAULT_REGION);
  } catch {
    parsed = undefined;
  }

  if (
    !parsed ||
    !parsed.isValid() ||
    Number(parsed.countryCallingCode) !== COUNTRY_CODE
  ) {
    return {
      valid: false,
      error: "Enter a valid +222 (Mauritania) phone number",
    };
  }

  return { valid: true, e164: parsed.number };
}

/** Progressive formatter for an input field: keeps typing natural. */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits.startsWith("222") && digits.length > 0) {
    return new AsYouType("MR").input(digits);
  }
  if (digits.startsWith("222")) {
    return new AsYouType("MR").input(`+${digits}`);
  }
  return digits;
}
