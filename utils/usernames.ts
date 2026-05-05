export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const normalizeUsername = (value: string) =>
  value.trim().toLowerCase().replace(/^@+/, "");

export const getUsernameError = (value: string) => {
  const username = normalizeUsername(value);

  if (!username) return "Choose a username.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use 3-20 lowercase letters, numbers, or underscores.";
  }

  return "";
};

export const formatUsername = (username?: string | null) =>
  username ? `@${username}` : "";
