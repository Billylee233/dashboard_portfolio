'use client';

import { useState, useEffect } from 'react';

/**
 * 날짜 기간 기준 IMP > 0 채널 목록을 반환하는 공통 훅.
 * 날짜 범위별로 결과를 캐싱해 동일 세션 내 중복 요청을 방지합니다.
 *
 * @param range   - 기준·비교 기간 { selStart, selEnd, cmpStart, cmpEnd }
 *                  전달하지 않으면 전체 기간 유니크값 (폴백)
 * @param saOnly  - true이면 SA_ 접두어 채널만 필터링
 */

export interface ChannelRange {
  selStart: string;
  selEnd:   string;
  cmpStart: string;
  cmpEnd:   string;
}

// 날짜 범위별 캐시: key = "selStart|selEnd|cmpStart|cmpEnd" 또는 "all"
const _cache   = new Map<string, string[]>();
const _pending = new Map<string, Promise<string[]>>();

function cacheKey(range?: ChannelRange): string {
  if (!range) return 'all';
  return `${range.selStart}|${range.selEnd}|${range.cmpStart}|${range.cmpEnd}`;
}

async function fetchChannels(range?: ChannelRange): Promise<string[]> {
  const key = cacheKey(range);
  if (_cache.has(key)) return _cache.get(key)!;
  if (_pending.has(key)) return _pending.get(key)!;

  const url = range
    ? `/api/channels?selStart=${range.selStart}&selEnd=${range.selEnd}&cmpStart=${range.cmpStart}&cmpEnd=${range.cmpEnd}`
    : '/api/channels';

  const p = fetch(url)
    .then(r => r.json())
    .then(d => {
      const result: string[] = d.channels ?? [];
      _cache.set(key, result);
      _pending.delete(key);
      return result;
    })
    .catch(() => {
      _pending.delete(key);
      return [] as string[];
    });

  _pending.set(key, p);
  return p;
}

export function useChannels(
  range?: ChannelRange,
  saOnly = false,
): { channels: string[]; loading: boolean } {
  const key = cacheKey(range);
  const cached = _cache.get(key) ?? null;

  const [channels, setChannels] = useState<string[]>(
    cached ? (saOnly ? cached.filter(c => c.startsWith('SA_')) : cached) : [],
  );
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    const k = cacheKey(range);
    const hit = _cache.get(k);
    if (hit) {
      setChannels(saOnly ? hit.filter(c => c.startsWith('SA_')) : hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchChannels(range).then(all => {
      setChannels(saOnly ? all.filter(c => c.startsWith('SA_')) : all);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.selStart, range?.selEnd, range?.cmpStart, range?.cmpEnd, saOnly]);

  return { channels, loading };
}

/** 캐시 전체 무효화 (날짜 변경 시 호출) */
export function invalidateChannelCache() {
  _cache.clear();
  _pending.clear();
}
