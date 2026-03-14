import { Head, Link } from 'suivant'

export const getStaticProps = async () => {
  return {
    props: {
      title: 'Suivant Example',
      description: 'A minimal SSG-only React framework.',
    },
  }
}

export default function Home({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>
        Check out the <Link href="/about">about page</Link> or browse{' '}
        <Link href="/users/1">user profiles</Link>.
      </p>
    </>
  )
}
