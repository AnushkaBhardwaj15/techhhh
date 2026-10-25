import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAudioEnabled,
  setAudioEnabled,
  playMarkSound,
  playUnmarkSound,
  playNewClueSound,
  playWinFanfareSound,
} from './audio';

describe('audio synthesizer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to audio enabled when no preference is saved', () => {
    expect(isAudioEnabled()).toBe(true);
  });

  it('persists audio preferences to localStorage', () => {
    setAudioEnabled(false);
    expect(isAudioEnabled()).toBe(false);
    expect(localStorage.getItem('tt_audio_enabled')).toBe('false');

    setAudioEnabled(true);
    expect(isAudioEnabled()).toBe(true);
    expect(localStorage.getItem('tt_audio_enabled')).toBe('true');
  });

  it('safely plays sound without throwing when muted or unmuted', () => {
    expect(() => {
      setAudioEnabled(false);
      playMarkSound();
      playUnmarkSound();
      playNewClueSound();
      playWinFanfareSound();
    }).not.toThrow();

    expect(() => {
      setAudioEnabled(true);
      playMarkSound();
      playUnmarkSound();
      playNewClueSound();
      playWinFanfareSound();
    }).not.toThrow();
  });
});
