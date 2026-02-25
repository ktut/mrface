/**
 * Unified input for kart: WASD / arrows / gamepad / mobile on-screen controls.
 * Exposes throttle (0..1), brake (0..1), steer (-1..1).
 */

export interface GameInput {
  throttle: number;
  brake: number;
  steer: number;
}

const STEER_SPEED = 3;
export class InputManager {
  private keys: Set<string> = new Set();
  private steerValue = 0; // -1 to 1, smoothed
  private throttleValue = 0;
  private brakeValue = 0;
  private mobileSteer = 0;
  private mobileThrottle = 0;
  private mobileBrake = 0;
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundGamepadLoop: number | null = null;

  constructor() {
    this.boundKeyHandler = this.handleKey.bind(this);
  }

  start() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.boundKeyHandler);
    window.addEventListener('keyup', this.boundKeyHandler);
    this.boundGamepadLoop = window.setInterval(() => this.pollGamepad(), 50);
  }

  stop() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.boundKeyHandler);
    window.removeEventListener('keyup', this.boundKeyHandler);
    if (this.boundGamepadLoop != null) {
      clearInterval(this.boundGamepadLoop);
      this.boundGamepadLoop = null;
    }
  }

  private handleKey(e: KeyboardEvent) {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (e.type === 'keydown') this.keys.add(key);
    else this.keys.delete(key);
  }

  private pollGamepad() {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      // Left stick X = steer, right trigger / A = throttle, left trigger / B = brake
      const steer = pad.axes[0] ?? 0;
      const throttle = pad.buttons[7]?.value ?? pad.buttons[6]?.value ?? 0; // RT or LT
      const brake = pad.buttons[6]?.value ?? pad.buttons[1]?.value ?? 0;   // LT or B
      if (Math.abs(steer) > 0.1 || throttle > 0.1 || brake > 0.1) {
        this.steerValue = steer;
        this.throttleValue = Math.max(0, throttle);
        this.brakeValue = Math.max(0, brake);
        return;
      }
    }
  }

  /** Set mobile on-screen values (e.g. from virtual buttons). */
  setMobileInput(steer: number, throttle: number, brake: number) {
    this.mobileSteer = Math.max(-1, Math.min(1, steer));
    this.mobileThrottle = Math.max(0, Math.min(1, throttle));
    this.mobileBrake = Math.max(0, Math.min(1, brake));
  }

  getInput(dt: number): GameInput {
    let throttle = this.mobileThrottle;
    let brake = this.mobileBrake;
    let steer = this.mobileSteer;

    const w = this.keys.has('w') || this.keys.has('arrowup');
    const s = this.keys.has('s') || this.keys.has('arrowdown');
    const a = this.keys.has('a') || this.keys.has('arrowleft');
    const d = this.keys.has('d') || this.keys.has('arrowright');

    if (w) throttle = Math.max(throttle, 1);
    if (s) brake = Math.max(brake, 1);
    if (a) steer = Math.min(steer, -1);
    if (d) steer = Math.max(steer, 1);

    if (throttle === 0 && brake === 0 && steer === 0) {
      throttle = this.throttleValue;
      brake = this.brakeValue;
      steer = this.steerValue;
    }

    this.steerValue += (steer - this.steerValue) * Math.min(1, STEER_SPEED * dt);
    return {
      throttle,
      brake,
      steer: Math.max(-1, Math.min(1, this.steerValue)),
    };
  }
}
