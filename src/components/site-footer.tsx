export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 text-sm text-muted-foreground">
        <p>
          This is a third-party service made by{" "}
          <a
            href="https://ejqs.net"
            target="_blank"
            rel="noopener"
            className="text-link hover:underline"
          >
            @ejqs
          </a>
        </p>
        <p className="hidden sm:block">Not affiliated with Roam Research.</p>
      </div>
    </footer>
  );
}
