// The first advance during typing reveals the line. A separate advance confirms it.
export function createDialogueReveal(text, {
  animate, onText, onReady, onConfirm,
  schedule = callback => setTimeout(callback, 24), cancel = clearTimeout,
}) {
  const letters = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
    : Array.from(text);
  let visible = '';
  let index = 0;
  let timer;
  let state = 'typing';

  function finish() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    state = 'ready';
    onText(text);
    onReady();
  }

  function tick() {
    if (state !== 'typing') return;
    visible += letters[index++];
    if (index >= letters.length) finish();
    else {
      onText(visible);
      timer = schedule(tick);
    }
  }

  if (animate && letters.length) {
    onText('');
    timer = schedule(tick);
  } else finish();

  return {
    advance() {
      if (state === 'typing') finish();
      else if (state === 'ready') {
        state = 'closed';
        onConfirm();
      }
    },
    abort() {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      state = 'closed';
    },
  };
}
