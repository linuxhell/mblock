// SPDX-License-Identifier: GPL-3.0-only
// Serialized by scripting.executeScript. Returns booleans/timings, never titles,
// account data, video IDs, response bodies, cookies or request parameters.
export function probeYouTubePlayer() {
  try {
    const player = document.getElementById('movie_player'), video = document.querySelector('video');
    const visible = selector => { const el = document.querySelector(selector); if (!el) return false; const rect = el.getBoundingClientRect(), css = getComputedStyle(el); return rect.width > 0 && rect.height > 0 && css.display !== 'none' && css.visibility !== 'hidden'; };
    const initial = window.ytInitialPlayerResponse;
    return { playerPresent: !!player, videoPresent: !!video, adPlaying: !!player?.classList.contains('ad-showing'), adInterrupting: !!player?.classList.contains('ad-interrupting'), skipButtonVisible: visible('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button'), initialAdMetadataPresent: !!(initial?.adPlacements?.length || initial?.adSlots?.length || initial?.playerAds?.length), videoReadyState: video?.readyState ?? null, videoErrorCode: video?.error?.code ?? null, currentTimeSeconds: video ? Math.round(video.currentTime) : null, durationSeconds: video && Number.isFinite(video.duration) ? Math.round(video.duration) : null };
  } catch { return { probeFailed: true }; }
}
