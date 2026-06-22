/** @jest-environment jsdom */

if (typeof PointerEvent === 'undefined') {
  global.PointerEvent = class PointerEvent extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  };
}

const { attachLongPress } = require('../../app/mobile.js');

function makeBtn() {
  const btn = document.createElement('button');
  btn.setPointerCapture = jest.fn();
  document.body.appendChild(btn);
  return btn;
}
function pd(btn) { btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true })); }
function pu(btn) { btn.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true })); }
function pc(btn) { btn.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })); }

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

describe('attachLongPress', () => {
  test('short tap calls onTap only', () => {
    const btn = makeBtn();
    const onTap = jest.fn(); const onLong = jest.fn();
    attachLongPress(btn, onTap, onLong);
    pd(btn); pu(btn);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLong).not.toHaveBeenCalled();
  });

  test('holding 500ms calls onLong only', () => {
    const btn = makeBtn();
    const onTap = jest.fn(); const onLong = jest.fn();
    attachLongPress(btn, onTap, onLong);
    pd(btn);
    jest.advanceTimersByTime(500);
    pu(btn);
    expect(onLong).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  test('pointercancel calls neither callback', () => {
    const btn = makeBtn();
    const onTap = jest.fn(); const onLong = jest.fn();
    attachLongPress(btn, onTap, onLong);
    pd(btn); pc(btn);
    jest.advanceTimersByTime(1000);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLong).not.toHaveBeenCalled();
  });

  test('pressing class added on pointerdown, removed on pointerup', () => {
    const btn = makeBtn();
    attachLongPress(btn, jest.fn(), jest.fn());
    pd(btn);
    expect(btn.classList.contains('pressing')).toBe(true);
    pu(btn);
    expect(btn.classList.contains('pressing')).toBe(false);
  });

  test('pressing class removed on pointercancel', () => {
    const btn = makeBtn();
    attachLongPress(btn, jest.fn(), jest.fn());
    pd(btn);
    expect(btn.classList.contains('pressing')).toBe(true);
    pc(btn);
    expect(btn.classList.contains('pressing')).toBe(false);
  });

  test('pressing class removed when long-press timer fires', () => {
    const btn = makeBtn();
    attachLongPress(btn, jest.fn(), jest.fn());
    pd(btn);
    expect(btn.classList.contains('pressing')).toBe(true);
    jest.advanceTimersByTime(500);
    expect(btn.classList.contains('pressing')).toBe(false);
  });
});
