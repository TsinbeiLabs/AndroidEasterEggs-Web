import { mountEgg, type HostHandle } from './core/host';
import { EGGS, findEgg, isReady } from './core/registry';
import type { EggMeta } from './core/types';
import './shell.css';

const listEl = document.getElementById('egg-list');
const stageEl = document.getElementById('stage');
const nameEl = document.getElementById('stage-name');
const metaEl = document.getElementById('stage-meta');
const actionsEl = document.getElementById('stage-actions');
const backEl = document.getElementById('back');

if (listEl === null || stageEl === null || nameEl === null || metaEl === null || actionsEl === null || backEl === null) {
  throw new Error('shell markup is missing');
}

let handle: HostHandle | null = null;
let activeId: string | null = null;

const STATUS_LABEL: Record<EggMeta['status'], string> = {
  ready: '可玩',
  wip: '施工中',
  planned: '待移植',
};

function renderList(): void {
  if (listEl === null) return;
  const fragment = document.createDocumentFragment();

  for (const meta of EGGS) {
    const item = document.createElement('a');
    const ready = isReady(meta);
    item.className = ready ? 'egg-item' : 'egg-item is-disabled';
    item.href = ready ? `#/eggs/${meta.id}` : '#/';
    if (!ready) item.setAttribute('aria-disabled', 'true');
    if (meta.id === activeId) item.classList.add('is-active');

    const version = document.createElement('span');
    version.className = 'egg-version';
    version.textContent = meta.version;

    const body = document.createElement('span');
    body.className = 'egg-body';

    const codename = document.createElement('span');
    codename.className = 'egg-codename';
    codename.textContent = meta.codename;

    const title = document.createElement('span');
    title.className = 'egg-title';
    title.textContent = ready ? meta.title : STATUS_LABEL[meta.status];

    body.append(codename, title);

    const badge = document.createElement('span');
    badge.className = `egg-badge is-${meta.status}`;
    badge.textContent = STATUS_LABEL[meta.status];

    item.append(version, body, badge);
    fragment.appendChild(item);
  }

  listEl.replaceChildren(fragment);
}

function showHome(): void {
  if (stageEl === null || nameEl === null || metaEl === null) return;
  nameEl.textContent = 'Android Easter Eggs';
  metaEl.textContent = '选择左侧任意一个已移植的彩蛋';
  stageEl.replaceChildren(homePanel());
}

function homePanel(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'home';

  const ready = EGGS.filter(isReady).length;

  wrap.innerHTML = `
    <h2>把 Android 彩蛋搬到浏览器里</h2>
    <p>
      从 Android 2.3 Gingerbread 一直到最新的版本，逐个把系统设置里“关于手机 → Android 版本”
      连点触发的彩蛋用 TypeScript + Canvas 2D 重新实现，不使用任何位图素材，全部由矢量绘制。
    </p>
    <p class="home-progress">已移植 <strong>${ready}</strong> / ${EGGS.length} 个版本</p>
    <p class="home-note">
      移植参考 AOSP 与 <a href="https://github.com/hushenghao/AndroidEasterEggs" target="_blank" rel="noreferrer">hushenghao/AndroidEasterEggs</a>（Apache-2.0），
      详见 <a href="#/about">关于与致谢</a>。
    </p>
  `;
  return wrap;
}

function showAbout(): void {
  if (stageEl === null || nameEl === null || metaEl === null) return;
  nameEl.textContent = '关于与致谢';
  metaEl.textContent = 'License & attribution';
  const wrap = document.createElement('div');
  wrap.className = 'home';
  wrap.innerHTML = `
    <h2>关于</h2>
    <p>本项目是 Android 系统彩蛋的 Web 移植，代码以 Apache-2.0 许可发布。</p>
    <h3>致谢</h3>
    <ul>
      <li>AOSP <code>frameworks/base</code> 中各版本 PlatLogo / 彩蛋的原始实现。</li>
      <li>
        <a href="https://github.com/hushenghao/AndroidEasterEggs" target="_blank" rel="noreferrer">hushenghao/AndroidEasterEggs</a>
        —— 完整的 Android 彩蛋合集，本项目按其模块逐个对照移植。
      </li>
      <li>Android 2.3 Gingerbread 的僵尸插画原作：Jack Larson。</li>
    </ul>
    <h3>说明</h3>
    <p>所有画面均由 Canvas 2D 矢量绘制，未打包任何位图或音频素材；进度与收藏保存在浏览器 localStorage。</p>
    <p>Google、Android 及各版本甜品代号均为 Google LLC 的商标。</p>
  `;
  stageEl.replaceChildren(wrap);
}

async function showEgg(meta: EggMeta): Promise<void> {
  if (stageEl === null || nameEl === null || metaEl === null || actionsEl === null) return;
  if (!isReady(meta)) {
    showHome();
    return;
  }

  nameEl.textContent = `${meta.codename} · ${meta.title}`;
  metaEl.textContent = `Android ${meta.version} · API ${meta.api}`;

  try {
    handle = await mountEgg(stageEl, actionsEl, meta);
  } catch (error) {
    stageEl.replaceChildren(errorPanel(error));
    return;
  }

  const hint = handle.egg.hint;
  if (hint !== undefined && metaEl !== null) {
    metaEl.textContent += ` · ${hint}`;
  }
}

function errorPanel(error: unknown): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'home';
  wrap.innerHTML = `<h2>加载失败</h2><pre>${String(error)}</pre>`;
  return wrap;
}

function teardown(): void {
  if (handle !== null) {
    handle.destroy();
    handle = null;
  }
  actionsEl?.replaceChildren();
}

function currentRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash === '' ? '/' : hash;
}

async function route(): Promise<void> {
  const path = currentRoute();
  teardown();

  const eggMatch = /^\/eggs\/([a-z0-9-]+)$/.exec(path);
  if (eggMatch !== null) {
    const meta = findEgg(eggMatch[1]);
    activeId = meta?.id ?? null;
    renderList();
    if (meta === undefined) {
      showHome();
      return;
    }
    await showEgg(meta);
    return;
  }

  activeId = null;
  renderList();

  if (path === '/about') {
    showAbout();
    return;
  }
  showHome();
}

backEl.addEventListener('click', () => {
  window.location.hash = '#/';
});

window.addEventListener('hashchange', () => {
  void route();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && currentRoute() !== '/') {
    window.location.hash = '#/';
  }
});

renderList();
void route();
