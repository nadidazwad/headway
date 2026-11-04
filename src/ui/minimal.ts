const KEY = "headway.minimal";

/** The visitor's own choice if they have made one. Private browsing can refuse storage, which is fine. */
export function readMinimal(byDefault: boolean): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? byDefault : saved === "1";
  } catch {
    return byDefault;
  }
}

/** The button for minimal mode, top left. It remembers the choice and tells `onChange` what it is. */
export function createMinimalSwitch(root: HTMLElement, startOn: boolean, onChange: (on: boolean) => void): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "minimal-switch";
  button.textContent = "MINIMAL";
  button.setAttribute("aria-pressed", String(startOn));
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Remembered only until the page closes, then.
    }
    onChange(on);
  });
  root.append(button);
}
