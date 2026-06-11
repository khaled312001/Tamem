/**
 * useWebDragScroll — enable mouse-drag horizontal panning on RN ScrollViews
 * when they're rendered on web. On a phone or tablet the native touch handler
 * already drags; this hook only kicks in for Platform.OS === 'web'.
 *
 * Why this exists: react-native-web's ScrollView lets the user pan with the
 * trackpad / wheel, but a plain mouse click doesn't trigger any scroll. That
 * makes carousels on a desktop browser feel broken — exactly the bug the
 * user reported on the Categories + Banner sections of HomeScreen.
 *
 * Usage:
 *   const ref = useRef<ScrollView>(null);
 *   useWebDragScroll(ref);
 *   <ScrollView ref={ref} horizontal ...>...</ScrollView>
 */
import { useEffect, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

export function useWebDragScroll(ref: RefObject<ScrollView | null>): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const instance = ref.current as unknown as {
      getScrollableNode?: () => HTMLElement;
    } | null;
    if (!instance) return;
    const el = instance.getScrollableNode?.();
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let moved = false;

    const handleDown = (e: MouseEvent) => {
      // Ignore right-clicks and modified clicks — leave them for the
      // browser's own menu / link behaviour.
      if (e.button !== 0) return;
      isDown = true;
      moved = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    };
    const handleMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const dx = x - startX;
      if (Math.abs(dx) > 4) moved = true;
      e.preventDefault();
      // Horizontal scroll on the same axis the page is laid out in.
      // RTL ScrollViews still use a positive scrollLeft on web, so the
      // delta math is the same as LTR.
      el.scrollLeft = scrollLeft - dx;
    };
    const release = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = 'grab';
    };
    // Click handler swallows the click that would otherwise fire on the
    // child after a drag — without this every drag turns into a tap and
    // categories accidentally navigate as the user lets go.
    const handleClick = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };

    el.style.cursor = 'grab';
    el.style.userSelect = 'none';
    el.addEventListener('mousedown', handleDown);
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
    el.addEventListener('click', handleClick, true);
    return () => {
      el.removeEventListener('mousedown', handleDown);
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseup', release);
      el.removeEventListener('mouseleave', release);
      el.removeEventListener('click', handleClick, true);
    };
  }, [ref]);
}
