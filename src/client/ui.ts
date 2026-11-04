/** Small building blocks for the menus. They know nothing about the game. */

const root = document.getElementById("ui")!;

export const element = (html: string) => {
  const box = document.createElement("div");
  box.innerHTML = html.trim();
  return box.firstElementChild as HTMLElement;
};

let beforePress: () => void = () => undefined;
/** Called before any menu button acts, so sound can start on the first click. */
export function onButtonPress(action: () => void) {
  beforePress = action;
}

export type ButtonSpec = [label: string, action: () => void, kind?: string];

export function buttons(items: ButtonSpec[]) {
  const box = element(`<div class="stack"></div>`);
  for (const [label, action, kind] of items) {
    const button = document.createElement("button");
    button.textContent = label;
    if (kind) button.className = kind;
    button.addEventListener("click", () => {
      beforePress();
      action();
    });
    box.append(button);
  }
  return box;
}

/** Replaces whatever menu is open with a panel holding these children. */
export function panel(...children: (HTMLElement | string)[]) {
  const box = element(`<section class="panel"></section>`);
  for (const child of children) box.append(typeof child === "string" ? element(child) : child);
  root.replaceChildren(box);
  box.querySelector<HTMLButtonElement>("button")?.focus();
  return box;
}

export function closeMenu() {
  root.replaceChildren();
}

export const menuOpen = () => root.childElementCount > 0;

/** Arrow keys move between menu buttons. */
export function moveFocus(delta: number) {
  const list = [...root.querySelectorAll<HTMLButtonElement>("button")];
  if (list.length === 0) return;
  const index = list.indexOf(document.activeElement as HTMLButtonElement);
  list[(index + delta + list.length) % list.length].focus();
}

export function toast(text: string) {
  const box = document.getElementById("toasts")!;
  const item = element(`<div class="toast"></div>`);
  item.textContent = text;
  box.append(item);
  setTimeout(() => item.remove(), 2200);
}
