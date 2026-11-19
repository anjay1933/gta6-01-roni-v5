// input.js — keyboard + mouse state for the whole game.
// One place owns the key map so controls stay consistent between menus,
// on-foot play and driving. Pointer drag orbits the camera; click shoots.

export const keys = Object.create(null);
export const mouse = {
  dragging: false,
  dx: 0, // accumulated drag since last frame (consumed by main loop)
  dy: 0,
  down: false,
  downX: 0, downY: 0,
  wheel: 0,
};

const GAME_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyM',
  'KeyV', 'Space', 'ShiftLeft', 'ShiftRight', 'Escape', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
];

export function isDown(code) {
  return !!keys[code];
}

export function anyMoveKey() {
  return isDown('KeyW') || isDown('KeyA') || isDown('KeyS') || isDown('KeyD')
    || isDown('ArrowUp') || isDown('ArrowDown') || isDown('ArrowLeft') || isDown('ArrowRight');
}

export function consumeMouse() {
  const out = { dx: mouse.dx, dy: mouse.dy, wheel: mouse.wheel };
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.wheel = 0;
  return out;
}

export function attachInput(canvas, handlers) {
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) keys[e.code] = true;
    if (handlers.onKey) handlers.onKey(e.code, true);
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (handlers.onKey) handlers.onKey(e.code, false);
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.dragging = false;
    mouse.down = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    mouse.dragging = true;
    mouse.downX = e.clientX;
    mouse.downY = e.clientY;
    if (handlers.onMouseDown) handlers.onMouseDown(e.button);
  });
  window.addEventListener('mouseup', (e) => {
    mouse.down = false;
    mouse.dragging = false;
    if (handlers.onMouseUp) handlers.onMouseUp(e.button);
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouse.dragging) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    mouse.wheel += e.deltaY;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
