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

  // 클릭: 단순 토글
  const handleClick = useCallback((id: string) => {
    toggleOne(id);
  }, [toggleOne]);

  // 드래그 선택: mousedown → mouseenter → mouseup
  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
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
    toggleAll,
    toggleOne,
    handleClick,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
  };
}
