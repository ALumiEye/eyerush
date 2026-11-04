import type { Input } from "../core/types";

/** Keyboard, gamepad and touch, folded into one Input per tick. */

const held = new Set<string>();
const pressed = new Set<string>();

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  held.add(event.code);
  pressed.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
});
window.addEventListener("keyup", (event) => held.delete(event.code));
window.addEventListener("blur", () => held.clear());

const any = (...codes: string[]) => codes.some((code) => held.has(code));

/** True once per key press. */
export function wasPressed(...codes: string[]) {
  const hit = codes.some((code) => pressed.has(code));
  for (const code of codes) pressed.delete(code);
  return hit;
}

export const clearPresses = () => pressed.clear();

let steer = 0;
const touch = { left: false, right: false, brake: false, honk: false, boost: false, active: false };
let padHonk = false;
let padBoost = false;

function gamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const stick = Math.abs(pad.axes[0] ?? 0) > 0.15 ? pad.axes[0] : 0;
    const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    return {
      steer: stick || dpad,
      throttle: (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0),
      boost: !!pad.buttons[0]?.pressed,
      honk: !!(pad.buttons[2]?.pressed || pad.buttons[1]?.pressed),
      pause: !!pad.buttons[9]?.pressed,
    };
  }
  return null;
}

let padPauseHeld = false;
/** True once when the gamepad's start button goes down. */
export function padPause() {
  const pad = gamepad();
  const now = !!pad?.pause;
  const hit = now && !padPauseHeld;
  padPauseHeld = now;
  return hit;
}

/** The player's controls for this tick. Keyboard steering eases in so a tap is a small correction. */
export function readInput(): Input {
  const pad = gamepad();
  const left = any("KeyA", "ArrowLeft") || touch.left;
  const right = any("KeyD", "ArrowRight") || touch.right;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = target === 0 ? 0.25 : Math.sign(target) !== Math.sign(steer) ? 0.3 : 0.12;
  steer += Math.max(-rate, Math.min(rate, target - steer));
  let finalSteer = steer;
  let throttle = (any("KeyW", "ArrowUp") ? 1 : 0) - (any("KeyS", "ArrowDown") ? 1 : 0);
  if (touch.active) throttle = touch.brake ? -1 : 1;
  if (pad && (Math.abs(pad.steer) > 0 || Math.abs(pad.throttle) > 0.05)) {
    if (Math.abs(pad.steer) > 0) finalSteer = pad.steer;
    if (Math.abs(pad.throttle) > 0.05) throttle = pad.throttle;
  }
  const honkNow = any("KeyH", "ShiftLeft", "ShiftRight") || touch.honk || !!pad?.honk;
  const boostNow = any("Space") || touch.boost || !!pad?.boost;
  const input: Input = {
    throttle,
    steer: finalSteer,
    honk: honkNow && !padHonk,
    boost: boostNow && !padBoost,
    reset: wasPressed("KeyR"),
  };
  padHonk = honkNow;
  padBoost = boostNow;
  return input;
}

/** On-screen buttons for phones: steer on the left, brake, horn and boost on the right. */
export function setupTouch(root: HTMLElement) {
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return false;
  const make = (id: keyof typeof touch, label: string, cls: string) => {
    const button = document.createElement("button");
    button.className = `touch ${cls}`;
    button.textContent = label;
    const set = (value: boolean) => (event: Event) => {
      event.preventDefault();
      (touch[id] as boolean) = value;
    };
    button.addEventListener("pointerdown", set(true));
    button.addEventListener("pointerup", set(false));
    button.addEventListener("pointercancel", set(false));
    button.addEventListener("pointerleave", set(false));
    root.append(button);
  };
  make("left", "◀", "left");
  make("right", "▶", "right");
  make("brake", "PHANH", "brake");
  make("honk", "BÍP", "honk");
  make("boost", "⚡", "boost");
  touch.active = true;
  return true;
}
