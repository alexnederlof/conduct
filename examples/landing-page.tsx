import { useState } from 'react';
import { Button } from 'conduct/ui';

export default function LandingPage() {
  const [joined, setJoined] = useState(false);
  return (
    <main className="min-h-screen bg-background text-foreground p-8 md:p-14">
      <nav className="flex justify-between items-center border-b border-border pb-6">
        <span className="font-semibold tracking-tight text-2xl">
          fieldwork<span className="text-primary">.</span>
        </span>
        <span className="text-xs tracking-widest uppercase text-muted-foreground">
          A little room to think
        </span>
      </nav>
      <section className="py-16 max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-primary mb-6">For ideas in progress</p>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight tracking-tight mb-6">
          Good work begins
          <br />
          with a little space.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed max-w-md mb-8">
          A thoughtful home for your team’s notes, references, and not-quite-finished ideas. Make
          room for what comes next.
        </p>
        <Button size="lg" onClick={() => setJoined(true)}>
          {joined ? 'You’re on the list. Thank you!' : 'Find your space →'}
        </Button>
      </section>
      <section className="grid md:grid-cols-3 gap-5 border-t border-border pt-8">
        {[
          ['01', 'Gather the good stuff', 'Keep your notes, sparks, and references in one place.'],
          ['02', 'Think out loud', 'Give your team something to build on, even before it’s ready.'],
          ['03', 'Make it better', 'Thoughtful feedback, right where the work happens.'],
        ].map(([number, title, body]) => (
          <article key={number} className="bg-white border border-border rounded-xl p-6">
            <span className="text-xs text-primary">{number}</span>
            <h2 className="font-semibold tracking-tight text-xl mt-5 mb-3">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>
      <footer className="mt-12 text-xs text-muted-foreground">
        Thoughtfully made. A work in progress.
      </footer>
    </main>
  );
}
