import Head from 'suivant/head'
import Link from 'suivant/link'

export default function About() {
  return (
    <>
      <Head>
        <title>About - Suivant Example</title>
      </Head>
      <h1>About</h1>
      <p>
        Suivant is a minimal SSG-only React framework with file-based routing,
        static generation, and client-side navigation.
      </p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </>
  )
}
