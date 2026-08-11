/**
 * Hand off to the live tracking screen for an order that was just created.
 *
 * Every creation flow (cart checkout, shipping, merchant request, dynamic
 * service) used to inline this, and every one of them stopped after the
 * `navigate` — leaving its own screen sitting in the Home stack's history with
 * the customer's filled-in form still on it. Tap the الرئيسية tab after
 * ordering and you were looking at the checkout page again, cart now empty,
 * with no sign the order had gone through. `popToTop` is the missing half: the
 * flow that produced the order is finished, so it should not be somewhere the
 * back gesture can return to.
 *
 * The pop runs on the NEXT tick. Doing it synchronously unmounts the screen
 * whose mutation callback is still executing, and React Navigation then drops
 * the tab navigate that was dispatched from it.
 */

/** The slice of a stack navigation object this helper needs. Structural on
 *  purpose — every caller passes a `NativeStackNavigationProp` for a different
 *  route, and naming any one of them here would only fit that one screen. */
interface StackNavLike {
  getParent: () => unknown;
  popToTop?: () => void;
}

interface TabNavLike {
  navigate: (name: string, params?: object) => void;
}

export function goToNewOrder(navigation: StackNavLike, orderId: string): void {
  const parent = navigation.getParent() as TabNavLike | undefined;
  if (!parent?.navigate) {
    // No tab navigator above us (the web build mounts some stacks standalone)
    // — at least clear the finished flow.
    navigation.popToTop?.();
    return;
  }
  parent.navigate('Orders', {
    screen: 'OrderTracking',
    params: { orderId, justCreated: true },
  });
  setTimeout(() => {
    try {
      navigation.popToTop?.();
    } catch {
      // The stack may already be gone — nothing left to reset.
    }
  }, 0);
}
