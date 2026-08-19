import { useState, useRef, useCallback, useMemo, useEffect } from "react";

/**
 * 테이블 행 선택 훅: 드래그 선택 + Shift+클릭 범위 선택 지원
 * @param sortedIds - 현재 정렬/필터된 행의 ID 배열
 */
export function useRowSelection(sortedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isDragging = useRef(false);
  const lastClickedIndex = useRef<number | null>(null);

  // 현재 목록 중 몇 개가 선택됐는지 (목록 밖에 남은 선택은 계산에서 제외)
  const selectedInListCount = useMemo(
    () => sortedIds.reduce((n, id) => (selected.has(id) ? n + 1 : n), 0),
    [sortedIds, selected]
  );
  const allSelected = sortedIds.length > 0 && selectedInListCount === sortedIds.length;
  const someSelected = selectedInListCount > 0 && !allSelected;

  // 목록(필터/검색)이 바뀌면 현재 목록에 없는 선택은 정리 — 보이지 않는 행이
  // 일괄 작업 대상에 남거나 전체선택 상태 판정이 어긋나는 것을 방지
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const inList = new Set(sortedIds);
      const next = new Set([...prev].filter((id) => inList.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sortedIds]);

  // 하나라도 선택돼 있으면 해제, 아무것도 없으면 전체 선택
  const toggleAll = useCallback(() => {
    if (selectedInListCount > 0) setSelected(new Set());
    else setSelected(new Set(sortedIds));
  }, [selectedInListCount, sortedIds]);

  const toggleOne = useCallback((id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    lastClickedIndex.current = sortedIds.indexOf(id);
  }, [selected, sortedIds]);

  // 클릭: 단순 토글 / Shift+클릭: 직전 클릭 행부터 범위 선택
  const handleClick = useCallback((id: string, e?: React.MouseEvent) => {
    const idx = sortedIds.indexOf(id);
    if (e?.shiftKey && lastClickedIndex.current !== null && idx !== -1) {
      const start = Math.min(lastClickedIndex.current, idx);
      const end = Math.max(lastClickedIndex.current, idx);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(sortedIds[i]);
        return next;
      });
      lastClickedIndex.current = idx;
      return;
    }
    toggleOne(id);
  }, [toggleOne, sortedIds]);

  // 드래그 선택: mousedown → mouseenter → mouseup
  // (Shift+클릭은 범위 선택이므로 드래그를 시작하지 않는다)
  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (e.button !== 0 || e.shiftKey) return;
    isDragging.current = true;
  }, []);

  const handleMouseEnter = useCallback((id: string) => {
    if (!isDragging.current) return;
    const next = new Set(selected);
    next.add(id);
    setSelected(next);
  }, [selected]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastClickedIndex.current = null;
  }, []);

  return {
    selected,
    setSelected,
    allSelected,
    someSelected,
    selectedInListCount,
    toggleAll,
    toggleOne,
    handleClick,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
  };
}
