"use client";

import { useState } from "react";
import styles from "./landing.module.css";

type Faq = { q: string; a: string };

export default function LandingFaq({ faqs }: { faqs: Faq[] }) {
    const [openIndex, setOpenIndex] = useState(0);

    return (
        <div className={styles.faqList}>
            {faqs.map((f, i) => {
                const open = openIndex === i;
                const panelId = `faq-panel-${i}`;
                const triggerId = `faq-trigger-${i}`;
                return (
                    <div key={f.q} className={styles.faqItem}>
                        <h3 style={{ margin: 0 }}>
                            <button
                                type="button"
                                id={triggerId}
                                className={styles.faqTrigger}
                                aria-expanded={open}
                                aria-controls={panelId}
                                onClick={() => setOpenIndex(open ? -1 : i)}
                            >
                                <span className={styles.faqQuestion}>{f.q}</span>
                                <span className={styles.faqGlyph} aria-hidden="true">
                                    {open ? "−" : "+"}
                                </span>
                            </button>
                        </h3>
                        {open && (
                            <div id={panelId} role="region" aria-labelledby={triggerId} className={styles.faqAnswer}>
                                {f.a}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
