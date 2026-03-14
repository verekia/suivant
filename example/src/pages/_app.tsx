import Link from 'suivant/link'
import './styles.css'

export default function App({
  Component,
  pageProps,
}: {
  Component: React.ComponentType<any>
  pageProps: Record<string, any>
}) {
  return (
    <div className="app">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/users/1">User 1</Link>
        <Link href="/users/2">User 2</Link>
      </nav>
      <main>
        <Component {...pageProps} />
      </main>
    </div>
  )
}
