/**
 * The shuttle stands in for the hidden mouse pointer on the wall.
 *
 * Its nose must sit on the pointer, it must turn the short way toward where it
 * is going, fire its engine only while moving, ignore touch, and get out of the
 * way when the mouse rests or leaves the window.
 */
import {
  headingOf,
  IDLE_HIDE_MS,
  RESTING_HEADING,
  ShuttlePointer,
  THRUST_MS,
  turnToward,
} from './ShuttlePointer.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

console.log('\n1. heading arithmetic');
check('moving up points up', close(headingOf(0, -10), 0));
check('moving right points right', close(headingOf(10, 0), 90));
check('moving left points left', close(Math.abs(headingOf(-10, 0)), 90));
check('turning takes the short way across +/-180', close(turnToward(170, -170, 1), 190));
check('turning is gradual', close(turnToward(0, 90, 0.5), 45));

console.log('\n2. following the mouse');
const classes = new Set();
const ship = { style: {} };
const element = {
  style: {},
  classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
  },
  querySelector: (selector) => (selector === '.ship' ? ship : null),
};
const listeners = {};
const target = {
  addEventListener: (type, fn) => { listeners[type] = fn; },
  removeEventListener: (type) => { delete listeners[type]; },
};
let timers = [];
const pointer = new ShuttlePointer({
  element,
  target,
  setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
  clearTimer: (timer) => { timers = timers.filter((t) => t !== timer); },
});
const fire = (ms) => timers.filter((t) => t.ms === ms).forEach((t) => { timers = timers.filter((x) => x !== t); t.fn(); });

check('starts listening', pointer.start() === true && typeof listeners.pointermove === 'function');
check('hidden until the mouse moves', !classes.has('visible'));
listeners.pointermove({ clientX: 100, clientY: 200, pointerType: 'mouse' });
check('appears at the pointer', classes.has('visible') && element.style.transform === 'translate(100px, 200px)');
check('rests at its resting tilt', ship.style.transform === `rotate(${RESTING_HEADING.toFixed(1)}deg)`);
listeners.pointermove({ clientX: 160, clientY: 200, pointerType: 'mouse' });
check('fires its engine while moving', classes.has('thrusting'));
check('turns toward the movement', pointer.heading > RESTING_HEADING, `${pointer.heading.toFixed(1)} deg`);
fire(THRUST_MS);
check('engine stops when the mouse stops', !classes.has('thrusting') && classes.has('visible'));
fire(IDLE_HIDE_MS);
check('fades away when the mouse rests', !classes.has('visible'));

listeners.pointermove({ clientX: 10, clientY: 10, pointerType: 'mouse' });
listeners.mouseout({ relatedTarget: null });
check('hides when the mouse leaves the window', !classes.has('visible'));
listeners.pointermove({ clientX: 10, clientY: 10, pointerType: 'mouse' });
listeners.pointermove({ clientX: 50, clientY: 50, pointerType: 'touch' });
check('touch never shows the shuttle', !classes.has('visible'));
pointer.stop();
check('stop removes every listener', Object.keys(listeners).length === 0);

if (failures) {
  console.log(`\n${failures} shuttle pointer check(s) failed`);
  process.exit(1);
}
console.log('\nShuttle pointer checks passed');
