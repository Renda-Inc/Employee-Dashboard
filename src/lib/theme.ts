/** Employee theme preference (light/dark). Stored per browser in
 * localStorage and applied as a `dark` class on <html>; the palette lives
 * in the `.dark` token block in styles.css. */
export type ThemePref = "light" | "dark";

const KEY = "renda-admin-theme";

export function storedTheme(): ThemePref {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: ThemePref): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage unavailable (private mode): the class still applies for the session.
  }
}
