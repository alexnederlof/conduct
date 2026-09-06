import { reviewSchema, type Round } from './model';

export function markdown(rounds: Round[]) {
  return rounds
    .map(
      (round) =>
        `# Review round ${round.number}\n\nSource: ${round.source.path}\nSHA-256: ${round.source.hash}\nSubmitted: ${round.submittedAt}\n${round.decision ? `Decision: ${round.decision}\n` : ''}\n${round.entries
          .map(
            (entry, index) =>
              `## ${index + 1}. ${entry.kind === 'edit' ? 'Suggested edit' : 'Comment'} [${entry.status}]\n\nID: ${entry.id}\n${entry.anchor.sourceLine ? `Source lines: ${entry.anchor.sourceLine}–${entry.anchor.sourceEndLine ?? entry.anchor.sourceLine}\n` : ''}Heading: ${entry.anchor.heading ?? '(none)'}\nSelector: ${entry.anchor.selector}\nText offsets: ${entry.anchor.start}–${entry.anchor.end}\n\nSelected text:\n${entry.anchor.exact
                .split('\n')
                .map((line) => '> ' + line)
                .join('\n')}\n\n${
                entry.kind === 'edit'
                  ? `Replacement (empty means deletion):\n${(entry.replacement ?? '')
                      .split('\n')
                      .map((line) => '> ' + line)
                      .join('\n')}\n\n`
                  : ''
              }${entry.body}\n`,
          )
          .join('\n')}${round.notes ? `## Overall feedback\n\n${round.notes}\n` : ''}`,
    )
    .join('\n---\n\n');
}

export async function waitForReview(path: string, after = 0, timeout = 0, signal?: AbortSignal) {
  const started = Date.now();
  while (!signal?.aborted) {
    const file = Bun.file(path);
    if (await file.exists()) {
      const state = reviewSchema.parse(await file.json());
      const rounds = state.rounds.filter((round) => round.number > after);
      if (rounds.length) return { schemaVersion: 1, reviewId: state.id, rounds };
    }
    if (timeout && Date.now() - started >= timeout * 1000)
      throw new Error('Timed out waiting for a submitted review. Draft feedback is still saved.');
    await Bun.sleep(300);
  }
  throw new Error('Waiting cancelled.');
}
