# Suivant

A minimal SSG-only React framework. File-based routing, static generation, client-side navigation. No server runtime.

## Quick Start

```bash
bun add suivant react react-dom
```

Create `src/pages/index.tsx`:

```tsx
export default function Home() {
  return <h1>Hello World</h1>
}
```

Start the dev server:

```bash
bunx suivant dev
```

Build for production:

```bash
bunx suivant build
```

Output goes to `out/`.

## CLI

```
suivant dev [--port <number>]   Start development server (default: 3000)
suivant build                   Build for production
suivant --version               Show version
suivant --help                  Show help
```

## Project Structure

```
my-app/
├── src/
│   └── pages/           # Page components (required)
│       ├── index.tsx     # → /
│       ├── about.tsx     # → /about
│       ├── [id].tsx      # → /:id (dynamic)
│       ├── _app.tsx      # Global layout (optional)
│       ├── _document.tsx # HTML template (optional)
│       └── users/
│           ├── index.tsx # → /users
│           └── [id].tsx  # → /users/:id
├── public/              # Static assets (optional)
├── styles.css           # Global CSS (optional)
└── out/                 # Build output (generated)
```

Pages can also live at the root in `pages/` instead of `src/pages/`. The `src/pages/` directory takes priority if both exist.

## Routing

Routes are derived from the file system. Files in `pages/` automatically become routes.

| File                   | Route         |
| ---------------------- | ------------- |
| `index.tsx`            | `/`           |
| `about.tsx`            | `/about`      |
| `users/index.tsx`      | `/users`      |
| `users/[id].tsx`       | `/users/:id`  |
| `blog/[slug].tsx`      | `/blog/:slug` |

Static routes are matched before dynamic ones. Files starting with `_` (except `_app` and `_document`) and dotfiles are ignored.

## Data Fetching

### `getStaticProps`

Fetch data at build time. The returned `props` are passed to the page component.

```tsx
import type { GetStaticProps } from 'suivant/types'

export const getStaticProps: GetStaticProps<{ name: string }> = async ({ params }) => {
  const data = await fetch(`https://api.example.com/users/${params.id}`)
  const user = await data.json()
  return { props: { name: user.name } }
}

export default function UserPage({ name }: { name: string }) {
  return <h1>{name}</h1>
}
```

**Signature:**

```ts
type GetStaticProps<P> = (context: {
  params: Record<string, string>
}) => Promise<{ props: P }> | { props: P }
```

### `getStaticPaths`

Required for dynamic routes (`[param]`). Defines which paths to pre-render.

```tsx
import type { GetStaticPaths, GetStaticProps } from 'suivant/types'

export const getStaticPaths: GetStaticPaths = async () => {
  const res = await fetch('https://api.example.com/users')
  const users = await res.json()
  return {
    paths: users.map((u: { id: string }) => ({ params: { id: u.id } })),
  }
}

export const getStaticProps: GetStaticProps<{ name: string }> = async ({ params }) => {
  const res = await fetch(`https://api.example.com/users/${params.id}`)
  const user = await res.json()
  return { props: { name: user.name } }
}

export default function UserPage({ name }: { name: string }) {
  return <h1>{name}</h1>
}
```

**Signature:**

```ts
type GetStaticPaths = () =>
  | Promise<{ paths: Array<{ params: Record<string, string> }> }>
  | { paths: Array<{ params: Record<string, string> }> }
```

## API

### `suivant/router`

#### `useRouter()`

Returns the router object for the current page.

```tsx
import { useRouter } from 'suivant/router'

export default function Page() {
  const router = useRouter()

  return (
    <div>
      <p>Path: {router.asPath}</p>
      <p>Pattern: {router.pathname}</p>
      <p>Params: {JSON.stringify(router.query)}</p>
      <button onClick={() => router.push('/about')}>Go to About</button>
      <button onClick={() => router.replace('/login')}>Replace with Login</button>
      <button onClick={() => router.back()}>Go Back</button>
    </div>
  )
}
```

**Return type:**

| Property    | Type                           | Description                              |
| ----------- | ------------------------------ | ---------------------------------------- |
| `pathname`  | `string`                       | Route pattern (e.g. `"/users/[id]"`)     |
| `query`     | `Record<string, string>`       | Parsed dynamic params (e.g. `{ id: "5" }`) |
| `asPath`    | `string`                       | Actual URL path (e.g. `"/users/5"`)      |
| `push`      | `(url: string) => Promise<void>` | Navigate to a URL                        |
| `replace`   | `(url: string) => Promise<void>` | Navigate without adding a history entry  |
| `back`      | `() => void`                   | Go back in browser history               |

### `suivant/link`

#### `Link`

Client-side navigation component. Default export.

```tsx
import Link from 'suivant/link'

<Link href="/about">About</Link>
<Link href="/users/5" replace>User 5</Link>
<Link href="https://example.com">External (normal navigation)</Link>
```

**Props:**

| Prop      | Type      | Default | Description                          |
| --------- | --------- | ------- | ------------------------------------ |
| `href`    | `string`  | —       | Target URL (required)                |
| `replace` | `boolean` | `false` | Use `replaceState` instead of `pushState` |

All standard `<a>` attributes are also accepted. External URLs, modifier-key clicks (cmd, ctrl, alt, shift), and `target="_blank"` links fall through to normal browser navigation.

### `suivant/head`

#### `Head`

Manages `<head>` tags declaratively. Default export. Works during both SSR (build time) and client-side rendering.

```tsx
import Head from 'suivant/head'

export default function Page() {
  return (
    <>
      <Head>
        <title>My Page</title>
        <meta name="description" content="Page description" />
        <meta property="og:title" content="My Page" />
        <link rel="canonical" href="https://example.com/page" />
      </Head>
      <h1>My Page</h1>
    </>
  )
}
```

Tags are automatically deduplicated. Last occurrence wins. Deduplication rules:

| Tag                      | Dedupe key                |
| ------------------------ | ------------------------- |
| `<title>`                | Always one per page       |
| `<meta name="...">`      | `name` attribute          |
| `<meta property="...">`  | `property` attribute      |
| `<meta charset>`         | Always one per page       |
| `<meta httpEquiv="...">` | `httpEquiv` attribute     |
| Any tag with `key` prop  | `key` value               |
| Everything else          | Not deduplicated (appended) |

## Special Files

### `_app.tsx`

Optional. Wraps every page. Use it for global layouts, providers, or CSS imports.

```tsx
import type { AppProps } from 'suivant/types'
import '../styles.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div>
      <nav>My App</nav>
      <main>
        <Component {...pageProps} />
      </main>
    </div>
  )
}
```

### `_document.tsx`

Optional. Controls the outer HTML shell. Exports a **function that returns an HTML string** (not a React component).

```tsx
import type { DocumentParams } from 'suivant/types'

export default function Document({ html, head, styles, scripts }: DocumentParams) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.ico" />
    ${head}
    ${styles}
  </head>
  <body>
    <div id="__suivant">${html}</div>
    ${scripts}
  </body>
</html>`
}
```

**Parameters:**

| Param     | Type     | Description                    |
| --------- | -------- | ------------------------------ |
| `html`    | `string` | Rendered page content          |
| `head`    | `string` | Collected `<Head>` tags        |
| `styles`  | `string` | CSS `<link>` tag               |
| `scripts` | `string` | JS chunks and inline data      |

## Types

All public types are available from `suivant/types`:

```ts
import type {
  SuivantPage,
  GetStaticProps,
  GetStaticPaths,
  SuivantRouter,
  AppProps,
  DocumentParams,
} from 'suivant/types'
```

| Type             | Description                                  |
| ---------------- | -------------------------------------------- |
| `SuivantPage<P>` | Page component type (`ComponentType<P>`)    |
| `GetStaticProps<P>` | Data fetching function signature          |
| `GetStaticPaths` | Path generation function signature           |
| `SuivantRouter`  | Return type of `useRouter()`                 |
| `AppProps`       | Props for `_app` (`{ Component, pageProps }`) |
| `DocumentParams` | Props for `_document` (`{ html, head, styles, scripts }`) |

## CSS

Import a CSS file in `_app.tsx`. Tailwind CSS v4 is detected and compiled automatically if present.

```tsx
// _app.tsx
import type { AppProps } from 'suivant/types'
import '../styles.css'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
```

The compiled CSS is output as `out/styles.css`.

## Static Assets

Files in the `public/` directory are copied to `out/` during build and served as-is during development.

```
public/favicon.ico → out/favicon.ico
public/images/logo.png → out/images/logo.png
```

## Build Output

```
out/
├── index.html
├── about.html
├── users/
│   └── 5.html
├── styles.css
├── favicon.ico
└── _suivant/
    ├── manifest.json
    ├── chunks/
    │   ├── page-index-[hash].js
    │   └── page-users-id-[hash].js
    └── data/
        ├── index.json
        ├── about.json
        └── users/5.json
```

The `out/` directory can be deployed to any static hosting provider.

## Requirements

- React 18.3+ or 19.0+
- React DOM 18.3+ or 19.0+
- Tailwind CSS 4 (optional)

## License

MIT
