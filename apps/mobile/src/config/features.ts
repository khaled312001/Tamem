/**
 * Switches for features that are built but deliberately not shown yet.
 *
 * They live here rather than next to the screen that renders them because a
 * feature is almost never reachable from one place. The wallet was hidden on
 * the profile screen and stayed one tap away on the home screen's shortcut row
 * — paused in the place you would look for it, live in the place people
 * actually tap.
 */

/**
 * «محفظتي» — the balance stat and the profile row, and the shortcut on the
 * home screen. The wallet screen itself stays registered, so flipping this to
 * `true` brings the whole feature back with no other change.
 */
export const SHOW_WALLET = false;
