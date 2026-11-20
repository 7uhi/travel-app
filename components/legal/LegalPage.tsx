import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { contactEmail, LEGAL_LAST_UPDATED } from "@/lib/legal";

/** Page shell for the privacy policy and terms: heading, date, readable prose. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Roam
      </Link>
      <h1 className="mt-4 font-display text-4xl tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated {LEGAL_LAST_UPDATED}</p>

      <div className="mt-8 text-[15px] leading-relaxed text-stone-700 [&_a]:font-medium [&_a]:text-pine [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>

      <LegalLinks className="mt-12 border-t border-stone-200 pt-6" />
    </main>
  );
}

/** The contact address as a mailto link, or a loud placeholder when unset locally. */
export function ContactEmail() {
  const email = contactEmail();
  if (!email) {
    return (
      <span className="rounded bg-red-50 px-1 font-mono text-sm text-red-700">
        CONTACT_EMAIL is not set
      </span>
    );
  }
  return <a href={`mailto:${email}`}>{email}</a>;
}

/** Small footer links to the legal pages. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex justify-center gap-5 text-sm ${className}`}>
      <Link href="/privacy" className="text-stone-500 hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="text-stone-500 hover:text-ink">
        Terms
      </Link>
    </nav>
  );
}
