/**
 * Share links for stores, products and offers.
 *
 *   https://deliverytamem.com/s/<merchantId>   store
 *   https://deliverytamem.com/p/<productId>    product
 *   https://deliverytamem.com/o/<offerId>      offer
 *
 * The web page behind each link (rendered by the API shim, route /share/...)
 * shows a preview card and, on Android, hands the link to this app as
 * tamem://<kind>/<id>. With the app installed and the domain verified
 * (/.well-known/assetlinks.json) Android skips the page and opens us directly.
 *
 * A link can arrive before the customer is signed in (or while they still owe
 * us a phone number), so it is parked and opened as soon as the customer tabs
 * exist. Merchants have no customer tabs; their links are dropped.
 */
import { useEffect, useState } from 'react';
import { Linking, Platform, Share } from 'react-native';

import { navigationRef } from './push';

export const SHARE_BASE = 'https://deliverytamem.com';

export type ShareKind = 's' | 'p' | 'o';
export type ShareTarget = { kind: ShareKind; id: string };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function shareUrl(kind: ShareKind, id: string): string {
  return `${SHARE_BASE}/${kind}/${encodeURIComponent(id)}`;
}

/** tamem://s/ID, tamem:///s/ID or https://(www.)deliverytamem.com/s/ID → target. */
export function parseShareUrl(url: string | null | undefined): ShareTarget | null {
  if (!url) return null;
  const m =
    /^tamem:\/\/\/?([spo])\/([^/?#]+)/i.exec(url) ??
    /^https?:\/\/(?:www\.)?deliverytamem\.com\/([spo])\/([^/?#]+)/i.exec(url);
  const kind = m?.[1]?.toLowerCase();
  const raw = m?.[2];
  if (!kind || !raw) return null;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return ID_RE.test(id) ? { kind: kind as ShareKind, id } : null;
}

/** Opens the share sheet with a title line and the link (WhatsApp draws the
 *  preview card from the link, so it goes last on its own line). */
export function shareItem(
  kind: ShareKind,
  id: string,
  lines: Array<string | null | undefined>,
): void {
  const message = [...lines.filter(Boolean), shareUrl(kind, id)].join('\n');
  void Share.share({ message }).catch(() => undefined);
}

let pending: ShareTarget | null = null;

function openTarget(t: ShareTarget): boolean {
  if (!navigationRef.isReady()) return false;
  const roots = navigationRef.getRootState()?.routeNames ?? [];
  if (!roots.includes('App')) return false;
  const [screen, params] =
    t.kind === 's'
      ? ['MerchantDetail', { merchantId: t.id }]
      : t.kind === 'p'
        ? ['ProductDetail', { productId: t.id }]
        : ['OfferDetail', { offerId: t.id }];
  // initial:false keeps Home under the page, so back lands on Home.
  navigationRef.navigate('App', { screen: 'HomeTab', params: { screen, params, initial: false } });
  return true;
}

/**
 * @param canOpen   a signed-in customer whose tabs are (about to be) mounted
 * @param dropLinks signed in as a merchant: links have nowhere to go
 */
export function useShareLinks(canOpen: boolean, dropLinks: boolean): void {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // On web the "initial URL" is just the page address; nothing to route.
    if (Platform.OS === 'web') return;
    const take = (url: string | null) => {
      const t = parseShareUrl(url);
      if (!t) return;
      pending = t;
      setTick((n) => n + 1);
    };
    void Linking.getInitialURL()
      .then(take)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending) return;
    if (dropLinks) {
      pending = null;
      return;
    }
    if (!canOpen) return; // keep it for after sign-in / phone number
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      if (!pending) return;
      if (openTarget(pending)) {
        pending = null;
        return;
      }
      // The customer tabs mount one render after canOpen flips; wait for them.
      if (++tries < 20) timer = setTimeout(go, 150);
    };
    go();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [tick, canOpen, dropLinks]);
}
