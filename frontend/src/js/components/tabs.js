/**
 * @file tabs.js
 * @description WAI-ARIA tabs pattern: roving tabindex plus Arrow/Home/End keyboard support.
 */

/** Index of the tab a key should activate, or -1 when the key is not a tab-navigation key. */
export function nextTabIndex(key, current, count) {
  const moves = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: count - 1 };
  return key in moves ? (moves[key] + count) % count : -1;
}

/**
 * Wires a tablist whose tabs carry `aria-controls` pointing at `role="tabpanel"` elements.
 * @param {HTMLElement} tablist element with role="tablist"
 * @param {(tab:HTMLElement)=>void} [onSelect] optional callback after selection
 * @returns {(tab:HTMLElement, focus?:boolean)=>void} selectTab function
 */
export function initTabs(tablist, onSelect) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];

  function selectTab(tab, focus = false) {
    tabs.forEach(t => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      t.classList.toggle('active', selected);
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
    if (onSelect) onSelect(tab);
  }

  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) selectTab(tab);
  });

  tablist.addEventListener('keydown', (e) => {
    const next = nextTabIndex(e.key, tabs.indexOf(document.activeElement), tabs.length);
    if (next < 0) return;
    e.preventDefault();
    selectTab(tabs[next], true);
  });

  return selectTab;
}
