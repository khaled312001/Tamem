/**
 * Triggers the browser's print dialog with a print stylesheet that hides the
 * sidebar, header, and any element marked with `data-print="hide"`. Users
 * then pick "Save as PDF" from the print dialog — this gives perfect Arabic
 * rendering (uses the system fonts the page already loaded) without needing
 * to embed a heavy Arabic font in jsPDF.
 *
 * Pass an optional containerId to print only that section.
 */
export function printReport(containerId?: string, title?: string): void {
  if (typeof document === 'undefined') return;
  const originalTitle = document.title;
  if (title) document.title = title;

  let cleanup = () => undefined as void;
  if (containerId) {
    // Hide everything except the target container
    const style = document.createElement('style');
    style.id = '__print_isolate__';
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #${containerId}, #${containerId} * { visibility: visible !important; }
        #${containerId} { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
      }
    `;
    document.head.appendChild(style);
    cleanup = () => {
      document.getElementById('__print_isolate__')?.remove();
    };
  }

  const onAfter = () => {
    cleanup();
    document.title = originalTitle;
    window.removeEventListener('afterprint', onAfter);
  };
  window.addEventListener('afterprint', onAfter);

  window.print();
}
