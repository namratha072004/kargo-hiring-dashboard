export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <form method="post" action="/api/login" className="card login-card tint-sun">
        <div className="brand" style={{ marginBottom: 14 }}><span className="brand-mark">📦</span>Kargo Hiring</div>
        <h1 style={{ fontSize: 26 }}>Welcome back, Arjun 👋</h1>
        <p className="ink2 small">Let&apos;s find your next PM.</p>
        <label style={{ marginTop: 16 }}>
          Password
          <input type="password" name="password" autoFocus required />
        </label>
        {error && <p className="err small">Wrong password, try again.</p>}
        <button className="big" style={{ width: "100%" }}>Sign in →</button>
      </form>
    </div>
  );
}
