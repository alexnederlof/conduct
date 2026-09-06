export function insertSuggestion(range: Range, replacement: string, id: string) {
  const insertion = range.startContainer.ownerDocument!.createElement('ins');
  insertion.dataset.mfUi = id;
  insertion.className = 'mf-insertion';
  insertion.textContent = replacement;
  insertion.title = 'Suggested replacement';
  const point = range.cloneRange();
  point.collapse(false);
  const original =
    point.startContainer.nodeType === Node.TEXT_NODE ? (point.startContainer as Text) : null;
  const prefix = original?.data.slice(0, point.startOffset);
  point.insertNode(insertion);
  const split = original ? (insertion.nextSibling as Text) : null;
  return () => {
    insertion.remove();
    // Restore only the text node we split. React owns other adjacent text nodes.
    if (original && split) {
      if (original.nextSibling === split && original.data === prefix)
        original.appendData(split.data);
      split.remove();
    }
  };
}
