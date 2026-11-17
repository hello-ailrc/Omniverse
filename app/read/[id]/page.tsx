'use client';
import { use } from 'react';
import Reader from '@/components/Reader';

export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Reader id={id} />;
}
