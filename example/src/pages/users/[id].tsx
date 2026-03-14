import { Head, Link, useRouter } from 'suivant'

const users: Record<string, { name: string; role: string }> = {
  '1': { name: 'Alice', role: 'Engineer' },
  '2': { name: 'Bob', role: 'Designer' },
  '3': { name: 'Charlie', role: 'Product Manager' },
}

export const getStaticPaths = async () => {
  return {
    paths: Object.keys(users).map((id) => ({ params: { id } })),
  }
}

export const getStaticProps = async ({ params }: { params: { id: string } }) => {
  const user = users[params.id]
  return {
    props: { id: params.id, name: user.name, role: user.role },
  }
}

export default function UserPage({
  id,
  name,
  role,
}: {
  id: string
  name: string
  role: string
}) {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>{name} - Suivant Example</title>
        <meta name="description" content={`${name}'s profile`} />
      </Head>
      <h1>{name}</h1>
      <p>Role: {role}</p>
      <p>Route pattern: {router.pathname}</p>
      <p>URL: {router.asPath}</p>
      <ul>
        {Object.entries(users)
          .filter(([uid]) => uid !== id)
          .map(([uid, u]) => (
            <li key={uid}>
              <Link href={`/users/${uid}`}>{u.name}</Link>
            </li>
          ))}
      </ul>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </>
  )
}
