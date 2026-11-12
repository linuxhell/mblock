// SPDX-License-Identifier: GPL-3.0-only
// Packaged into the ISOLATED YouTube script. The normal page uses a class-only
// player observer; bounded retries run only while the player reports an ad.
export function installYouTubePlayback(profileHash) {
  if (!['youtube.com', 'youtube-nocookie.com', 'youtubekids.com'].some(root => location.hostname === root || location.hostname.endsWith('.' + root))) return;
  const key = '__mblockYouTubePlayback';
  if (globalThis[key]?.profileHash === profileHash && globalThis[key].active) return;
  globalThis[key]?.dispose?.();
  const state = { profileHash, active: true, playerFound: false, installedAt: Date.now(), adEpisodes: 0, skipClicks: 0, seeks: 0, failedActions: 0, checks: 0 };
  globalThis[key] = state;
  const skipSelector = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button';
  const cueSelectors = ['.ytp-ad-preview-container', '.ytp-ad-text', '.ytp-ad-simple-ad-badge', '.ytp-ad-player-overlay', '.ytp-ad-duration-remaining'];
  let player, playerObserver, bootstrapObserver, bootstrapTimer, timer, inAd = false;
  let clicks = new WeakMap(), media = new WeakMap();
  const visible = el => {
    if (!el?.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return false;
    const css = getComputedStyle(el); return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  };
  const adState = () => !!player?.isConnected && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
  function check() {
    clearTimeout(timer); timer = null; if (!state.active) return;
    state.checks++;
    if (!adState()) { inAd = false; clicks = new WeakMap(); media = new WeakMap(); return; }
    if (!inAd) { inAd = true; state.adEpisodes++; }
    // Retry only inside an ad. This also handles delayed/enabled skip buttons.
    timer = setTimeout(check, 300);
    const now = performance.now();
    const video = player.querySelector('video');
    if (!video || video.paused || video.ended) { clearTimeout(timer); timer = null; return; }
    const button = Array.from(player.querySelectorAll(skipSelector)).find(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    if (button) {
      const attempts = clicks.get(button) || { count: 0, at: -Infinity };
      if (attempts.count < 3) {
        if (now - attempts.at < 900) return;
        attempts.count++; attempts.at = now; clicks.set(button, attempts);
        // Recheck immediately: a stale UI must never act on the next video.
        if (adState() && visible(button)) { try { button.click(); state.skipClicks++; } catch { state.failedActions++; } }
        return;
      }
    }
    // An unskippable ad needs corroborating visible ad UI, not an ID/class alone.
    if (!player.classList.contains('ad-showing')) return;
    const cues = cueSelectors.filter(selector => visible(player.querySelector(selector))).length;
    if (cues < (player.classList.contains('ad-interrupting') ? 1 : 2)) return;
    if (video.readyState < 1 || !Number.isFinite(video.duration) || video.duration < 0.25 || video.duration > 900 || video.duration - video.currentTime < 0.15 || !video.seekable.length) return;
    const end = video.seekable.end(video.seekable.length - 1);
    if (end < video.duration - 0.2) return;
    const source = video.currentSrc, duration = video.duration;
    let attempts = media.get(video);
    if (!attempts || attempts.source !== source || attempts.duration !== duration) attempts = { source, duration, count: 0, at: -Infinity };
    if (attempts.count >= 2 || now - attempts.at < 1500) return;
    attempts.count++; attempts.at = now; media.set(video, attempts);
    if (!adState() || !player.classList.contains('ad-showing') || video.currentSrc !== source || video.duration !== duration) return;
    try { video.currentTime = Math.max(0, Math.min(end, duration) - 0.05); state.seeks++; } catch { state.failedActions++; }
  }
  function bindPlayer() {
    if (!state.active) return;
    const next = document.getElementById('movie_player'); if (!next) return false;
    bootstrapObserver?.disconnect(); clearTimeout(bootstrapTimer);
    if (player !== next) {
      detachPlayer(); player = next; inAd = false;
      state.playerFound = true;
      playerObserver = new MutationObserver(check);
      playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      for (const name of ['play', 'loadedmetadata', 'durationchange']) player.addEventListener(name, check, true);
    }
    check(); return true;
  }
  function start() {
    state.active = true;
    if (bindPlayer()) return;
    bootstrapObserver?.disconnect(); clearTimeout(bootstrapTimer);
    bootstrapObserver = new MutationObserver(bindPlayer);
    bootstrapObserver.observe(document, { childList: true, subtree: true });
    bootstrapTimer = setTimeout(() => bootstrapObserver?.disconnect(), 20000);
  }
  function detachPlayer() { clearTimeout(timer); playerObserver?.disconnect(); for (const name of ['play', 'loadedmetadata', 'durationchange']) player?.removeEventListener(name, check, true); }
  function suspend() { state.active = false; clearTimeout(bootstrapTimer); detachPlayer(); bootstrapObserver?.disconnect(); player = null; state.playerFound = false; }
  const restore = event => { if (event.persisted) start(); };
  state.dispose = () => { suspend(); document.removeEventListener('yt-navigate-finish', start); document.removeEventListener('DOMContentLoaded', start); window.removeEventListener('pagehide', suspend); window.removeEventListener('pageshow', restore); };
  document.addEventListener('yt-navigate-finish', start);
  document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', restore);
  start();
}

// Serialized by scripting.executeScript; return only counters, never media URLs.
export function probeYouTubePlayback() {
  const state = globalThis.__mblockYouTubePlayback;
  if (!state) return null;
  const { profileHash, active, installedAt, playerFound, adEpisodes, skipClicks, seeks, failedActions, checks } = state;
  return { profileHash, active, installedAt, playerFound, adEpisodes, skipClicks, seeks, failedActions, checks };
}
