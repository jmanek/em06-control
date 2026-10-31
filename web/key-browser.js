import { KEYBOARD_KEYS, parseNamedCombo } from '../src/keyboard.js';

const groups = [
  ['Function', key => /^F\d+$/.test(key.name)],
  ['Navigation', key => ['Enter','Escape','Backspace','Tab','Space','CapsLock','PrintScreen','ScrollLock','Pause','Insert','Home','PageUp','Delete','End','PageDown','ArrowRight','ArrowLeft','ArrowDown','ArrowUp','ContextMenu','Power'].includes(key.name)],
  ['Letters', key => /^[A-Z]$/.test(key.name)],
  ['Numbers', key => /^\d$/.test(key.name)],
  ['Symbols', key => key.value >= 45 && key.value <= 56 || key.name === 'IntlBackslash'],
  ['Numpad', key => key.name.startsWith('Numpad') || key.name === 'NumLock'],
];
const normalize = name => name.toLowerCase().replace(/[\s_-]/g, '');

export function keyBrowser({ id, disabled, onPick }) {
  const root = document.createElement('details'); root.className = 'key-browser';
  const summary = document.createElement('summary'); summary.textContent = 'Browse keys'; root.append(summary);
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find a key…';
  search.setAttribute('aria-label', 'Find a keyboard key'); search.disabled = disabled;
  const categories = document.createElement('div'); categories.className = 'key-categories';
  categories.setAttribute('role', 'group'); categories.setAttribute('aria-label', 'Key categories');
  const grid = document.createElement('div'); grid.className = 'key-grid';
  grid.id = `key-grid-${id}`; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Keyboard keys');
  const empty = document.createElement('p'); empty.className = 'key-search-empty'; empty.textContent = 'No matching keys. You can still type a key name or use Advanced HID.'; empty.hidden = true;
  let selected = 'Function';
  const render = () => {
    const query = normalize(search.value.trim());
    let exact;
    try { const keys = parseNamedCombo(search.value); if (keys.length === 1 && keys[0].type === 1) exact = keys[0].value; } catch { /* Partial queries are normal. */ }
    const matches = query ? KEYBOARD_KEYS.filter(key => normalize(key.name).includes(query) || normalize(key.code).includes(query) || key.value === exact)
      .sort((a, b) => Number(b.value === exact) - Number(a.value === exact))
      : KEYBOARD_KEYS.filter(groups.find(([name]) => name === selected)[1]);
    grid.classList.toggle('key-grid-wide', !!query || ['Navigation','Symbols','Numpad'].includes(selected));
    grid.replaceChildren(); empty.hidden = matches.length !== 0;
    for (const key of matches) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = key.name;
      button.setAttribute('aria-label', `Use ${key.name}`); button.disabled = disabled;
      button.onclick = () => { onPick(key.name); root.open = false; };
      grid.append(button);
    }
    for (const button of categories.children) button.setAttribute('aria-pressed', String(!query && button.textContent === selected));
  };
  for (const [name] of groups) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name; button.disabled = disabled;
    button.setAttribute('aria-controls', grid.id);
    button.onclick = () => { selected = name; search.value = ''; render(); };
    categories.append(button);
  }
  search.oninput = render;
  root.append(search, categories, grid, empty); render();
  return root;
}
