# Third-party notices

## shadcn/ui

Components in `src/ui/` are adapted from shadcn/ui’s new-york-v4 registry at commit `7c9eaba1c0a6404c990c144a654792e3313c650d`. Imports are adapted for Conduct’s bundled runtime.

https://github.com/shadcn-ui/ui

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Inter

Inter is provided locally through `@fontsource-variable/inter`, under the SIL Open Font License 1.1. Its license is included in that dependency. https://rsms.me/inter/

## Bun runtime

The npm package depends on the official Bun binary distribution. Standalone executables embed Bun 1.3.14 and the production packages needed to render documents. Bun's upstream license and linked-library notices are preserved in [docs/licenses/BUN-LICENSE.md](docs/licenses/BUN-LICENSE.md). The corresponding runtime source is available at [oven-sh/bun, tag bun-v1.3.14](https://github.com/oven-sh/bun/tree/bun-v1.3.14); Conduct's source and binary build script are included in this repository so the application can be rebuilt with a modified runtime. Embedded npm dependencies retain their distributed license files.
