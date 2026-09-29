export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form method="post" action="/api/login" className="card narrow">
      <h1>Hiring dashboard</h1>
      <label>
        Password
        <input type="password" name="password" autoFocus required />
      </label>
      {error && <p className="err">Wrong password.</p>}
      <button>Sign in</button>
    </form>
  );
}
