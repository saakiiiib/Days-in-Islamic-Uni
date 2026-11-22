export const TIME_OF_DAY_OPTIONS = ['morning', 'midday', 'golden', 'dusk'];
export const SPAWN_LOCATIONS = ['main-gate', 'central-mosque', 'central-library', 'iu-lake'];

function createChoiceStore(validValues, defaultValue) {
  let value = defaultValue;
  const listeners = new Set();
  return {
    get value() { return value; },
    select(next) {
      if (!validValues.includes(next) || next === value) return false;
      value = next;
      for (const listener of listeners) listener(value);
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

/** Menu state exists before importing Three.js; loading cannot overwrite a choice. */
export function createCharacterSelection() {
  return createChoiceStore(['hujur', 'niqab'], 'hujur');
}

export function createTimeOfDaySelection() {
  return createChoiceStore(TIME_OF_DAY_OPTIONS, 'golden');
}

export function createSpawnSelection() {
  return createChoiceStore(SPAWN_LOCATIONS, 'main-gate');
}

export function createLanding(doc, { reload = () => doc.defaultView.location.reload() } = {}) {
  const $ = id => doc.getElementById(id);
  const queryButtons = (containerId, selector) => {
    const container = $(containerId);
    if (container?.querySelectorAll) return container.querySelectorAll(selector);
    return doc.querySelectorAll?.(selector) ?? [];
  };
  const selection = createCharacterSelection();
  const timeOfDay = createTimeOfDaySelection();
  const spawnLocation = createSpawnSelection();
  let ready = false;
  const gateButton = $('mainGateView'), landingElement = $('landing');
  const expandGate = expanded => {
    landingElement.classList.toggle('gate-expanded', expanded);
    gateButton?.setAttribute('aria-pressed', String(expanded));
    gateButton?.setAttribute('aria-label', expanded ? 'Return to start menu' : 'Expand Main Gate view');
    if (gateButton?.querySelector('span')) gateButton.querySelector('span').textContent = expanded ? '↙' : '↗';
    if (!expanded) landingElement.classList.remove('gate-live');
  };
  const refreshSelection = () => {
    for (const pill of doc.querySelectorAll('.char-pill')) {
      const selected = !pill.hidden && pill.dataset.char === selection.value;
      pill.classList.toggle('active', selected);
      pill.setAttribute('aria-pressed', String(selected));
    }
    if ($('selectionNumber')) $('selectionNumber').textContent = selection.value === 'hujur' ? '01 / 02' : '02 / 02';
  };
  const refreshTimeOfDay = () => {
    for (const pill of queryButtons('landingTimeOfDay', '[data-time]')) {
      const selected = pill.dataset.time === timeOfDay.value;
      pill.classList.toggle('active', selected);
      pill.setAttribute('aria-pressed', String(selected));
    }
    const lightingTime = $('lighting-time');
    if (lightingTime) lightingTime.value = timeOfDay.value;
  };
  const refreshSpawnLocation = () => {
    for (const pill of queryButtons('landingSpawn', '[data-spawn]')) {
      const selected = pill.dataset.spawn === spawnLocation.value;
      pill.classList.toggle('active', selected);
      pill.setAttribute('aria-pressed', String(selected));
    }
  };
  for (const pill of doc.querySelectorAll('.char-pill:not([hidden])')) {
    pill.addEventListener('click', () => selection.select(pill.dataset.char));
  }
  for (const pill of queryButtons('landingTimeOfDay', '[data-time]')) {
    pill.addEventListener('click', () => timeOfDay.select(pill.dataset.time));
  }
  for (const pill of queryButtons('landingSpawn', '[data-spawn]')) {
    pill.addEventListener('click', () => spawnLocation.select(pill.dataset.spawn));
  }
  $('lighting-time')?.addEventListener('change', event => {
    timeOfDay.select(event.target?.value ?? $('lighting-time')?.value);
  });
  selection.subscribe(refreshSelection);
  timeOfDay.subscribe(refreshTimeOfDay);
  spawnLocation.subscribe(refreshSpawnLocation);
  refreshSelection();
  refreshTimeOfDay();
  refreshSpawnLocation();
  $('retry-loading')?.addEventListener('click', reload);
  const dialog = $('controlsDialog');
  $('controlsButton')?.addEventListener('click', () => dialog?.showModal());
  for (const button of doc.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  gateButton?.addEventListener('click', () => expandGate(!landingElement.classList.contains('gate-expanded')));
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !landingElement.hidden && landingElement.classList.contains('gate-expanded')) {
      expandGate(false); gateButton?.focus();
    }
  });
  return {
    selection,
    timeOfDay,
    spawnLocation,
    get ready() { return ready; },
    setReady(value) {
      ready = Boolean(value);
      $('enterButton').disabled = !ready;
      $('loadingPanel').hidden = ready;
      $('enterButtonLabel').textContent = ready ? 'Enter Campus' : 'Preparing campus…';
    },
    progress(message, { completed, total, loadedBytes, totalBytes, detail } = {}) {
      const byteProgress = Number.isFinite(totalBytes) && totalBytes > 0;
      const countProgress = Number.isFinite(total) && total > 0;
      const fraction = byteProgress ? loadedBytes / totalBytes : countProgress ? completed / total : null;
      const percent = fraction === null ? null : Math.min(100, Math.max(0, Math.floor(fraction * 100)));
      $('loadingMessage').textContent = message;
      $('loadingPercent').textContent = detail ?? (byteProgress
        ? `${Math.round((loadedBytes ?? 0) / 1024)} / ${Math.round(totalBytes / 1024)} KB`
        : countProgress ? `${completed} / ${total}` : '');
      $('loadingBar').style.width = `${percent ?? 0}%`;
      $('loadingProgress').dataset.indeterminate = String(percent === null);
      if (percent === null) $('loadingProgress').removeAttribute('aria-valuenow');
      else $('loadingProgress').setAttribute('aria-valuenow', String(percent));
      $('loadingProgress').setAttribute('aria-valuetext', `${message} ${$('loadingPercent').textContent}`);
    },
    fail(error) {
      this.setReady(false);
      doc.body.dataset.gameState = 'error';
      $('error-message').textContent = error?.message || String(error);
      $('error-message').hidden = false;
      $('retry-loading').hidden = false;
      this.progress('Loading stopped. Retry when your connection is ready.');
    },
  };
}
