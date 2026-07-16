/**
 * Currencies a trip can be denominated in. A curated ISO 4217 subset keeps
 * the picker manageable and doubles as server-side validation — every code
 * here is understood by Intl.NumberFormat, so formatting never throws.
 */
export const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "KRW", label: "South Korean Won" },
  { code: "INR", label: "Indian Rupee" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NOK", label: "Norwegian Krone" },
  { code: "DKK", label: "Danish Krone" },
  { code: "PLN", label: "Polish Złoty" },
  { code: "CZK", label: "Czech Koruna" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "THB", label: "Thai Baht" },
  { code: "VND", label: "Vietnamese Dong" },
  { code: "AED", label: "UAE Dirham" },
  { code: "ZAR", label: "South African Rand" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}
