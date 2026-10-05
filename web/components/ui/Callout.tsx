/** An inline note on the page: neutral, success, warning or error. */
export default function Callout({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warn" | "error";
  children: React.ReactNode;
}) {
  const className = tone === "neutral" ? "callout" : `callout callout--${tone}`;
  return (
    <div className={`${className} fade-in`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}
