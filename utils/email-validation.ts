const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const COMMON_TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  comm: "com",
  coom: "com",
  nett: "net",
  orgg: "org",
  eduu: "edu",
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const getEmailValidationError = (value: string) => {
  const email = normalizeEmail(value);
  if (!email) return "Enter an email address.";
  if (!BASIC_EMAIL_PATTERN.test(email)) return "Enter a valid email address.";

  const domain = email.split("@")[1] ?? "";
  const tld = domain.split(".").pop() ?? "";
  const suggestedTld = COMMON_TLD_TYPOS[tld];

  if (suggestedTld) {
    return `Did you mean .${suggestedTld}? Fix the email before creating the account.`;
  }

  if (domain.includes("..")) {
    return "Email domain cannot contain two dots in a row.";
  }

  return "";
};
