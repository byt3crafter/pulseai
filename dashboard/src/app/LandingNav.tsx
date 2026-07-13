"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./landing.module.css";
import PulseLogo from "./PulseLogo";

const CONTACT = "mailto:hello@runstate.mu?subject=Pulse%20AI%20%E2%80%94%20Book%20a%20Demo";

const NAV_LINKS = [
    { href: "#use-cases", label: "Use cases" },
    { href: "#integrations", label: "Integrations" },
    { href: "#security", label: "Security" },
    { href: "#faq", label: "FAQ" },
];

export default function LandingNav() {
    const [open, setOpen] = useState(false);

    return (
        <header className={styles.nav}>
            <div className={styles.navInner}>
                <Link href="/" className={styles.navLogo} aria-label="Pulse AI home">
                    <PulseLogo size={40} textSize={24} />
                </Link>

                <nav className={styles.navLinks} aria-label="Primary">
                    {NAV_LINKS.map((l) => (
                        <a key={l.href} href={l.href}>
                            {l.label}
                        </a>
                    ))}
                    <Link href="/docs">Docs</Link>
                    <Link href="/login" className={styles.navSignIn}>
                        Sign in
                    </Link>
                </nav>

                <a href={CONTACT} className={styles.navCta}>
                    Book a Demo
                </a>

                <button
                    type="button"
                    className={styles.navToggle}
                    aria-label={open ? "Close menu" : "Open menu"}
                    aria-expanded={open}
                    aria-controls="mobile-nav-panel"
                    onClick={() => setOpen((v) => !v)}
                >
                    {open ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    )}
                </button>
            </div>

            {open && (
                <nav id="mobile-nav-panel" className={styles.navMobilePanel} aria-label="Mobile">
                    {NAV_LINKS.map((l) => (
                        <a key={l.href} href={l.href} className={styles.navMobileLink} onClick={() => setOpen(false)}>
                            {l.label}
                        </a>
                    ))}
                    <Link href="/docs" className={styles.navMobileLink} onClick={() => setOpen(false)}>
                        Docs
                    </Link>
                    <Link href="/login" className={styles.navMobileLink} onClick={() => setOpen(false)}>
                        Sign in
                    </Link>
                    <a href={CONTACT} className={styles.navMobileCta} onClick={() => setOpen(false)}>
                        Book a Demo
                    </a>
                </nav>
            )}
        </header>
    );
}
