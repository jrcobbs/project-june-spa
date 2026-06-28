# Converting your CSS to maintainable SCSS — a step-by-step walkthrough

Written for someone strong in Spring Boot + Thymeleaf and new to SCSS/React. Wherever it helps, each concept is mapped to something you already know on the backend.

## The mental model first

SCSS is a **superset** of CSS that compiles down to plain CSS — every valid `.css` file is already valid `.scss`. So "converting" is not a rewrite; it's renaming the files and then *progressively* pulling in the features that buy you maintainability. Think of it like moving a plain servlet into Spring: the code still runs, but now you have dependency injection, partials, and reusable components available when you want them.

The compiler (Dart Sass, the `sass` npm package) runs at **build time**. Vite invokes it automatically the moment it sees a `.scss` import — there is no runtime cost and no extra config. Your shipped CSS is identical in spirit; you just author it more sanely.

Three jobs SCSS does for you, each with a Spring analogy:

| SCSS feature | What it does | Closest Spring/Thymeleaf idea |
|---|---|---|
| Partials (`_file.scss`) | Split one big stylesheet into small files | Splitting a god-class into focused `@Component`s / Thymeleaf fragments |
| `@use` / `@forward` | Import one module into another, once | `import` + a package's public API |
| Mixins (`@mixin` / `@include`) | Reusable parameterised blocks of rules | A reusable method, or a `th:fragment` you call with arguments |
| Sass variables (`$x`) | Compile-time constants | `application.properties` values baked in at build |
| Nesting | Write child selectors inside parents | Nested Thymeleaf fragments mirroring HTML structure |

## Step 0 — Add the compiler

SCSS needs the `sass` package. I added it to your `package.json` devDependencies:

```jsonc
"devDependencies": {
  "sass": "^1.77.0",
  ...
}
```

Run this once on your machine (the sandbox here couldn't reach npm):

```bash
cd app
npm install
```

Vite needs **no** config change — it detects `.scss` imports and compiles them.

## Step 1 — Decide what becomes a Sass variable, and what stays a CSS custom property

This is the single most important decision, and it's where most newcomers go wrong. Your code already uses CSS custom properties (`--accent`, `--bg`, …) and a `prefers-color-scheme: dark` block that re-points them. **Keep those as CSS custom properties. Do not convert them to `$sass-variables`.**

Why: a Sass `$variable` is resolved at compile time and then it's gone from the output. A CSS custom property lives in the browser at runtime. Your dark mode works precisely *because* the values are runtime properties — one media query re-points every colour without touching a single rule. If you converted `--accent` to `$accent`, you'd have to duplicate every rule for dark mode. (The Spring parallel: a Sass variable is a value baked in at build like a `@Value` resolved at startup; a CSS custom property is more like a request-scoped bean that can differ per render.)

The rule of thumb, which I wrote into `base/_tokens.scss`:

- Value can change in the browser (theme colours) → **CSS custom property**
- Value is fixed at build time (breakpoints, z-index scale, spacing scale) → **Sass variable**

So in this project the colours stay as-is, and the thing that *should* become a Sass construct is the breakpoint.

## Step 2 — Kill the magic number: a breakpoint map + a mixin

Your old CSS repeated `@media (max-width: 1024px)` **ten times**. If the tablet cutoff ever changes, that's ten edits and a guaranteed missed one. This is the headline maintainability win.

In `styles/abstracts/_breakpoints.scss`:

```scss
@use 'sass:map';

$breakpoints: (
  'tablet': 1024px,
);

@mixin respond-below($name) {
  $value: map.get($breakpoints, $name);
  @if $value {
    @media (max-width: $value) { @content; }
  } @else {
    @error "respond-below: unknown breakpoint `#{$name}`.";
  }
}
```

Now every responsive block reads:

```scss
h1 {
  font-size: 56px;
  @include respond-below('tablet') {
    font-size: 36px;
  }
}
```

A few things worth understanding here, because they're the core of "SCSS thinking":

- **`@mixin` + `@include`** is a reusable method. `respond-below` is defined once and called everywhere — like a `th:fragment` you invoke with an argument.
- **`@content`** is the body you pass in `{ ... }` — the mixin wraps your rules in the media query. It's a callback / a fragment slot.
- **The `$breakpoints` map** is a `Map<String, Length>`. `map.get` is `map.get(key)`. One source of truth for cutoffs; add `'mobile': 600px` and it's instantly usable everywhere.
- **`@error` on an unknown key** turns a typo (`'tablett'`) into a build failure instead of a silently-dropped style — compile-time safety, the same instinct that makes you reach for an enum over a magic string.

## Step 3 — Split into partials (the "7-1 lite" layout)

A **partial** is a `.scss` file whose name starts with `_`. The underscore tells Sass "don't compile this to its own `.css` file — it's only meant to be imported." Same idea as a Thymeleaf fragment file: not a page on its own, only included.

Your two flat files became a small, purpose-named tree:

```
src/
├─ styles/
│  ├─ abstracts/
│  │  ├─ _breakpoints.scss   ← variables + the respond-below mixin (emits NO CSS)
│  │  └─ _index.scss         ← barrel: @forward 'breakpoints'
│  ├─ base/
│  │  ├─ _tokens.scss        ← :root custom properties (light + dark theme)
│  │  ├─ _elements.scss      ← body, #root shell, h1/h2/p/code
│  │  └─ _index.scss         ← barrel: @forward 'tokens'; @forward 'elements'
│  └─ main.scss              ← global entry, imported by main.tsx
└─ App.scss                  ← component + layout styles, imported by App.tsx
```

"Abstracts" is an important category: it holds things that **produce no CSS by themselves** — only variables and mixins. Importing an abstract is free; nothing is emitted until you actually `@include` something. (Like a utility class full of static helpers — importing it adds no behaviour until you call a method.)

I kept this **lightweight** on purpose. The full industry "7-1 pattern" has seven folders (abstracts, base, components, layout, pages, themes, vendors). For a ~300-line app that's bureaucracy. The principle to internalise is *grouping by responsibility*, not the exact folder count — start small, promote a folder when a file gets unwieldy.

## Step 4 — Wire modules together with `@use` and `@forward`

Modern Sass uses `@use` / `@forward`. **Do not use `@import`** — it's deprecated and being removed; it dumped everything into one global namespace (think wildcard static imports polluting everything).

- **`@use 'module'`** loads another file's variables/mixins, namespaced, and — crucially — **only once** even if ten files use it. No duplicated output. This is real module loading, like an `import` that the build deduplicates for you.
- **`@use 'module' as *`** drops the namespace so you can write `respond-below(...)` instead of `breakpoints.respond-below(...)`. Convenient for your own abstracts.
- **`@forward 'module'`** re-exports a file through another. That's what the `_index.scss` "barrel" files do: a consumer says `@use 'base'` and transparently gets both tokens and elements. It's the **public API** of a folder — exactly like a package exposing a facade so callers don't reach into internals.

One non-obvious rule that trips up newcomers: **`@use` is per-file.** Each file that calls `respond-below` must `@use` the abstracts itself — there's no global scope. That's why both `base/_elements.scss` and `App.scss` start with `@use './styles/abstracts' as *;`. It feels verbose, but it's the same explicitness as declaring your imports at the top of every Java file: you always know where a symbol comes from.

Load order also matters and is now explicit: `base/_index.scss` forwards `tokens` **before** `elements`, because the elements consume the custom properties the tokens define.

## Step 5 — Lean on nesting, but don't over-nest

SCSS lets you nest child selectors inside parents, mirroring your HTML structure (very Thymeleaf-like). Your `.hero` block already did this well. While converting I also folded the old top-level `#next-steps ul { ... }` selector *into* the `#next-steps` block in `App.scss`, so everything about that section lives in one place.

`&` is the parent-reference operator — `&:hover` compiles to `.counter:hover`. Handy for states and pseudo-elements (`&::before`).

The caution: **nesting depth becomes selector specificity.** Nest three or four levels deep and you generate `#next-steps ul a .button-icon`, which is hard to override and slow to reason about. Keep it to ~2–3 levels. Rule of thumb: nest to reflect genuine structure or states, not just because you can.

## Step 6 — Update the imports and delete the old files

Two one-line changes:

```tsx
// main.tsx
import './styles/main.scss'   // was './index.css'

// App.tsx
import './App.scss'           // was './App.css'
```

Then the old `index.css` and `App.css` are deleted (done). React's convention is **colocation**: a component owns its styles, so `App.tsx` imports `App.scss` sitting right next to it, while truly global styles (theme + base elements) live in `styles/main.scss` imported once at the app root. Loosely: `main.scss` is your global layout/theme; `App.scss` is a component's own fragment-scoped styling.

## Step 7 — Verify it builds

```bash
cd app
npm install      # pulls in sass
npm run build    # tsc -b && vite build — Vite compiles the SCSS
npm run dev      # or just run the dev server and eyeball it
```

If a `@use` path is wrong or a breakpoint name is misspelled, Sass fails the build with a clear message (that's the `@error` working for you) rather than silently shipping broken styles.

## What you gained, concretely

- The tablet breakpoint lives in **one** place instead of ten. Change `1024px` once.
- Theme colours stay runtime-switchable; dark mode keeps working with zero duplication.
- Files are small and named by responsibility, so "where do I change the heading size" has an obvious answer (`base/_elements.scss`).
- Adding a second breakpoint, a spacing scale, or a z-index scale is now a one-line addition to an abstract, usable everywhere.

## Sensible next steps (when, not now)

- Add a `$z-index` map in abstracts once you have more than a couple of stacking contexts (your `.hero` already juggles `z-index: 0/1`).
- Add a spacing scale (`$space-sm: 8px`, etc.) if the same paddings keep recurring.
- If `App.scss` grows past a few components, split it into `components/` partials and give it its own `_index.scss` barrel — the structure is already set up to scale that way.
