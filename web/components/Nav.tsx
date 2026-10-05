import Image from "next/image";
import Link from "next/link";

/** Top bar: the Kami mark, linking home. */
export default function Nav() {
  return (
    <nav className="top-nav" aria-label="Kami">
      <Link href="/" aria-label="Kami home" className="top-nav__home">
        <Image
          src="/kami-logo.png"
          alt="Kami"
          width={96}
          height={64}
          priority
          className="top-nav__logo"
        />
      </Link>
    </nav>
  );
}
