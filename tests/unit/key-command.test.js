/** @jest-environment jsdom */
// tests/unit/key-command.test.js

const { buildKeyCommand, KEY_MAP } = require('../../app/remote.js');

describe('buildKeyCommand', () => {
  test('produces ms.remote.control JSON with correct structure', () => {
    const result = JSON.parse(buildKeyCommand('KEY_ENTER'));
    expect(result).toEqual({
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: 'KEY_ENTER',
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey'
      }
    });
  });

  test('passes the key name through as DataOfCmd', () => {
    const result = JSON.parse(buildKeyCommand('KEY_VOLUP'));
    expect(result.params.DataOfCmd).toBe('KEY_VOLUP');
  });

  test('always sets Cmd to Click', () => {
    const result = JSON.parse(buildKeyCommand('KEY_HOME'));
    expect(result.params.Cmd).toBe('Click');
  });

  test('always sets Option to the string false', () => {
    const result = JSON.parse(buildKeyCommand('KEY_POWER'));
    expect(result.params.Option).toBe('false');
  });
});

describe('KEY_MAP', () => {
  test('maps arrow keys to TV navigation keys', () => {
    expect(KEY_MAP['ArrowUp']).toBe('KEY_UP');
    expect(KEY_MAP['ArrowDown']).toBe('KEY_DOWN');
    expect(KEY_MAP['ArrowLeft']).toBe('KEY_LEFT');
    expect(KEY_MAP['ArrowRight']).toBe('KEY_RIGHT');
  });

  test('maps Enter and Space both to KEY_ENTER', () => {
    expect(KEY_MAP['Enter']).toBe('KEY_ENTER');
    expect(KEY_MAP[' ']).toBe('KEY_ENTER');
  });

  test('maps shortcut letters', () => {
    expect(KEY_MAP['h']).toBe('KEY_HOME');
    expect(KEY_MAP['b']).toBe('KEY_RETURN');
    expect(KEY_MAP['p']).toBe('KEY_POWER');
  });

  test('maps volume and channel keys', () => {
    expect(KEY_MAP['+']).toBe('KEY_VOLUP');
    expect(KEY_MAP['-']).toBe('KEY_VOLDOWN');
    expect(KEY_MAP['0']).toBe('KEY_MUTE');
    expect(KEY_MAP['PageUp']).toBe('KEY_CHUP');
    expect(KEY_MAP['PageDown']).toBe('KEY_CHDOWN');
  });

  test('maps m to KEY_MENU', () => {
    expect(KEY_MAP['m']).toBe('KEY_MENU');
  });
});

describe('buildTextCommand', () => {
  const { buildTextCommand } = require('../../app/remote.js');

  test('base64-encodes text as a SendInputString command', () => {
    expect(JSON.parse(buildTextCommand('hello'))).toEqual({
      method: 'ms.remote.control',
      params: { Cmd: 'aGVsbG8=', DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' },
    });
  });

  test('encodes non-ASCII text as UTF-8', () => {
    const { params } = JSON.parse(buildTextCommand('åäö'));
    expect(Buffer.from(params.Cmd, 'base64').toString('utf8')).toBe('åäö');
  });
});

describe('buildInputEndCommand', () => {
  const { buildInputEndCommand } = require('../../app/remote.js');
  test('is a SendInputEnd control message', () => {
    expect(JSON.parse(buildInputEndCommand()).params.TypeOfRemote).toBe('SendInputEnd');
  });
});

describe('buildPointerCommand', () => {
  const { buildPointerCommand } = require('../../app/remote.js');
  test('Move carries a rounded absolute position', () => {
    const { params } = JSON.parse(buildPointerCommand('Move', 100.6, 200.2));
    expect(params.TypeOfRemote).toBe('ProcessMouseDevice');
    expect(params.Cmd).toBe('Move');
    expect(params.Position).toMatchObject({ x: 101, y: 200 });
    expect(typeof params.Position.Time).toBe('string');
  });
  test('clicks have no position', () => {
    const { params } = JSON.parse(buildPointerCommand('LeftClick'));
    expect(params).toEqual({ Cmd: 'LeftClick', TypeOfRemote: 'ProcessMouseDevice' });
  });
});
