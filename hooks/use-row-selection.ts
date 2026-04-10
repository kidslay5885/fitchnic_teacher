import { useState, useRef, useCallback } from "react";

/**
 * 테이블 행 선택 훅: 드래그 선택 + Shift+클릭 범위 선택 지원
 * @param sortedIds - 현재 정렬된 행의 ID 배열
 */
export function useRowSelection(sortedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isDragging = useRef(false);
  const lastClickedIndex = useRef<number | null>(null);

  const toggleAll = useCallback(() => {
    if (selected.size === sortedIds.length) setSelected(new Set());
    else setSelected(new Set(sortedIds));
  }, [selected.size, sortedIds]);

  const toggleOne = useCallback((id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    lastClickedIndex.current = sortedIds.indexOf(id);
  }, [selected, sortedIds]);

  // Shift+클릭: 마지막 클릭 위치부터 현재 위치까지 범위 선택
  const handleClick = useCallback((id: string, e: React.MouseEvent) => {
    const currentIndex = sortedIds.indexOf(id);
    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, currentIndex);
      const end = Math.max(lastClickedIndex.current, currentIndex);
      const next = new Set(selected);
      for (let i = start; i <= end; i++) {
        next.add(sortedIds[i]);
      }
      setSelected(next);
      lastClickedIndex.current = currentIndex;
    } else {
      toggleOne(id);
    }
  }, [sortedIds, selected, toggleOne]);

  // 드래그 선택: mousedown → mouseover → mouseup
  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    // 체크박스 영역에서만 드래그 시작
    if (e.button !== 0) return;
    isDragging.current = true;
    const next = new Set(selected);
    if (!e.shiftKey) {
      // shift 없으면 새로 시작
      if (!next.has(id)) next.add(id);
    }
    setSelected(next);
    lastClickedIndex.current = sortedIds.indexOf(id);
  }, [selected, sortedIds]);

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
    toggleAll,
    toggleOne,
    handleClick,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
  };
}
