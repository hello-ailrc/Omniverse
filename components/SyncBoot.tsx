'use client';
import { useEffect } from 'react';
import { startSync } from '@/lib/sync';

// Starts background sync once, on whichever screen the app opens.
export default function SyncBoot() {
  useEffect(() => {
    startSync();
  }, []);
  return null;
}
