/** A stamped confirmation mark ("Confirmed", "Sent"). Animates in once. */
export default function Seal({
  children,
  tone = "hanko",
}: {
  children: React.ReactNode;
  tone?: "hanko" | "moss";
}) {
  return <span className={`seal${tone === "moss" ? " seal--moss" : ""}`}>{children}</span>;
}
