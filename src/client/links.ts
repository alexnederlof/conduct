export function prepareLink(link: HTMLAnchorElement) {
  if (!link.getAttribute('href')?.startsWith('#')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
}

export function followFragment(link: HTMLAnchorElement, event: MouseEvent) {
  const href = link.getAttribute('href')!;
  if (!href.startsWith('#')) return;
  event.preventDefault();
  if (href === '#') link.ownerDocument.defaultView?.scrollTo({ top: 0 });
  else link.ownerDocument.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
}
