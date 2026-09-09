let root: HTMLElement | null = null;
let timer: number | undefined;
let current: HTMLElement | null = null;

function ensureRoot(): HTMLElement {
  if (root !== null && root.isConnected) return root;
  root = document.getElementById('toast-root');
  if (root === null) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

/** Android style toast: bottom centered pill, auto dismiss. */
export function showToast(message: string, seconds = 2): void {
  const host = ensureRoot();

  if (current !== null) {
    current.remove();
    current = null;
  }
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  el.setAttribute('role', 'status');
  host.appendChild(el);
  current = el;

  requestAnimationFrame(() => el.classList.add('toast-in'));

  timer = window.setTimeout(() => {
    el.classList.remove('toast-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    window.setTimeout(() => el.remove(), 400);
    if (current === el) current = null;
    timer = undefined;
  }, Math.max(0.4, seconds) * 1000);
}

export function hideToast(): void {
  if (current !== null) {
    current.remove();
    current = null;
  }
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
}
