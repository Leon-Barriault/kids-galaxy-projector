/**
 * A little shuttle that stands in for the mouse pointer on the wall.
 *
 * The page hides the system cursor (`cursor: none`) so a resting arrow never
 * sits on the projected galaxy. That also left whoever drives the wall with a
 * mouse - an adult steering the camera, a child pointing at their planet - with
 * nothing to follow. The shuttle is drawn instead: its nose is the hotspot, it
 * turns toward the direction it is moving, fires its engine while moving, and
 * fades away a few seconds after the mouse rests or leaves the window.
 *
 * Only mouse and pen input show it. Touch has no hover, and a shuttle stuck
 * under a finger would only hide what the child is touching.
 */

export const IDLE_HIDE_MS = 3000;
export const THRUST_MS = 160;
export const RESTING_HEADING = -25;
const MIN_TRAVEL_PX = 2;
const TURN_RATE = 0.35;

/** Degrees, 0 pointing up, positive clockwise - the way the shuttle is drawn. */
export function headingOf(dx, dy) {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Turn part of the way from `current` toward `target`, the short way round. */
export function turnToward(current, target, rate = TURN_RATE) {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  return current + delta * rate;
}

export class ShuttlePointer {
  constructor({
    element,
    target = typeof window !== 'undefined' ? window : null,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  }) {
    this.element = element;
    this.ship = element?.querySelector?.('.ship') || null;
    this.target = target;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.x = 0;
    this.y = 0;
    this.heading = RESTING_HEADING;
    this.hasPosition = false;
    this.idleTimer = null;
    this.thrustTimer = null;
    this.listeners = null;
  }

  start() {
    if (!this.element || !this.target || this.listeners) return false;
    this.listeners = {
      pointermove: (event) => this.move(event.clientX, event.clientY, event.pointerType),
      pointerdown: (event) => this.move(event.clientX, event.clientY, event.pointerType),
      blur: () => this.hide(),
      mouseout: (event) => {
        if (!event.relatedTarget) this.hide();
      },
    };
    Object.entries(this.listeners).forEach(([type, fn]) => this.target.addEventListener(type, fn));
    return true;
  }

  stop() {
    if (!this.listeners) return;
    Object.entries(this.listeners).forEach(([type, fn]) => this.target.removeEventListener(type, fn));
    this.listeners = null;
    this.hide();
  }

  move(x, y, pointerType = 'mouse') {
    if (pointerType === 'touch') {
      this.hide();
      return;
    }
    if (this.hasPosition) {
      const dx = x - this.x;
      const dy = y - this.y;
      if (Math.hypot(dx, dy) >= MIN_TRAVEL_PX) {
        this.heading = turnToward(this.heading, headingOf(dx, dy));
        this.setThrusting(true);
      }
    }
    this.x = x;
    this.y = y;
    this.hasPosition = true;
    this.render();
    this.element.classList.add('visible');

    this.clearTimer(this.idleTimer);
    this.idleTimer = this.setTimer(() => this.hide(), IDLE_HIDE_MS);
  }

  setThrusting(on) {
    this.clearTimer(this.thrustTimer);
    this.element.classList.toggle('thrusting', on);
    if (on) this.thrustTimer = this.setTimer(() => this.setThrusting(false), THRUST_MS);
  }

  hide() {
    this.clearTimer(this.idleTimer);
    this.clearTimer(this.thrustTimer);
    this.element?.classList.remove('visible', 'thrusting');
  }

  render() {
    this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
    if (this.ship) this.ship.style.transform = `rotate(${this.heading.toFixed(1)}deg)`;
  }
}
