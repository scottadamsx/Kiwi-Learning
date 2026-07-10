export default function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display mb-6 text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}
