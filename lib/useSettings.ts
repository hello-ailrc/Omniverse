'use client';
import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings } from './store';
import { DEFAULT_SETTINGS, type Settings } from './types';

// Reads the saved settings and applies the theme to the page.
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--read-size', settings.fontSize + 'px');
    if (settings.theme === 'custom') {
      root.style.setProperty('--bg', settings.customBg);
      root.style.setProperty('--fg', settings.customFg);
    } else {
      root.style.removeProperty('--bg');
      root.style.removeProperty('--fg');
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return [settings, update];
}
