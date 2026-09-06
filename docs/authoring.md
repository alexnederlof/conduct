# Authoring documents

[← Back to Conduct](../README.md)

## Formats

| Input              | Rendering                                                             | Source context                                                                |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.md`, `.markdown` | Markdown with tables, fenced code, raw HTML, and a reading stylesheet | Exact quote, nearby text, DOM selector, heading, containing source lines      |
| `.html`, `.htm`    | Your page, with Tailwind available                                    | Exact quote, nearby text, DOM selector, heading, containing HTML source lines |
| `.tsx`, `.jsx`     | Default-exported React component, bundled by Bun for the browser      | Exact quote, nearby text, DOM selector, heading                               |

Choose Markdown for prose. Choose React when reusable components, lists, or interactions help express a design. JSX can reduce repetitive markup, but plain prose is usually more concise in Markdown.

### React and Tailwind

No app scaffolding or Tailwind configuration is needed:

```tsx
import { useState } from 'react';
import { Button } from 'conduct/ui';

export default function Proposal() {
  const [expanded, setExpanded] = useState(false);
  return (
    <main className="mx-auto max-w-3xl bg-background p-12 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">A thought worth sharing</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed">
        Select any part of this paragraph to leave inline feedback.
      </p>
      <Button className="mt-8" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Less detail' : 'More detail'}
      </Button>
      {expanded && <p className="mt-4">A little more context.</p>}
    </main>
  );
}
```

React, React DOM, and `conduct/ui` resolve from the presenter, so the document can live outside an existing JavaScript project. Other npm imports must already be installed in the document’s project. Relative JS/TS component imports are bundled; their literal Tailwind class names are scanned too. Use complete class names (`bg-primary`), not interpolated names (`bg-${color}-900`). Tailwind compiles locally using its official class scanner, including arbitrary values and state variants.

Local images, stylesheets, browser scripts, fonts, and media can be referenced relative to the document. Assets must stay inside its directory; hidden paths, arbitrary source files, and symlinks escaping that directory are blocked. Self-contained documents and components give the most reproducible reviews.

### Built-in shadcn components

React previews include a curated set adapted from [shadcn/ui](https://ui.shadcn.com/docs/components). Their dependencies, styles, and shared theme are already available. No setup command or document-level install is needed:

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from 'conduct/ui';
// Individual imports also work: import { Button } from 'conduct/ui/button';

export default function Proposal() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>A small, considered step</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Badge variant="secondary">Ready to review</Badge>
          <p className="leading-relaxed">Bring the open questions closer to the work.</p>
          <Button variant="outline">Explore the idea</Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

Included: **Button**, **Badge**, **Card** (Header, Title, Description, Action, Content, Footer), **Input**, **Textarea**, **Tabs** (List, Trigger, Content), **Accordion** (Item, Trigger, Content), and `cn` for class merging. Interactive components use Radix primitives. See [examples/reading-room.tsx](../examples/reading-room.tsx) for a complete example with stateful buttons, tabs, an accordion, and inputs. Enable **Interact** to try the controls.

This is a starter set, not the entire shadcn registry. Additional components can be added as local source files with their dependencies installed using Bun. HTML can use the shared Tailwind tokens and `conduct-prose`; React components require a `.tsx`/`.jsx` preview. Attribution and licenses are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

### External JavaScript and chart libraries

HTML previews support scripts from any HTTP/HTTPS site, inline JavaScript, ES modules and import maps, dynamic imports, workers, and network requests. There is no CDN allowlist or extra flag. Libraries that compile templates or generate code at runtime can use `eval` and `new Function` inside the preview. Browser CORS rules still apply to modules, fonts, and data requests.

Include libraries as you would in an ordinary HTML page:

```html
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react-is@18.3.1/umd/react-is.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/recharts@3.10.1/umd/Recharts.js"
></script>
```

[examples/recharts.html](../examples/recharts.html) is a complete interactive chart using these CDN scripts. It requires no npm install in the document’s directory:

```sh
bun run start examples/recharts.html
```

Select **Interact** to switch chart metrics and use other controls; select **Comment** or **Suggest** to review its text. This HTML document supplies its own React version, independently of Conduct’s review UI. For modules, use `<script type="module">` with a CDN that sends appropriate CORS headers.

For a `.tsx` document, install dependencies in the document’s project and use normal package imports:

```sh
bun add recharts react-is@19.2.8
```

```tsx
import { Area, AreaChart } from 'recharts';
```

Conduct bundles these imports with its provided React runtime (currently 19.2.8). Use HTML modules for direct CDN imports; the TSX bundler resolves installed packages and local files.
