import Link from "next/link";

import { ContactEmail, LegalPage } from "@/components/legal/LegalPage";
import { MINIMUM_AGE } from "@/lib/legal";

export const metadata = {
  title: "Terms of service — Roam",
  description: "The rules for using Roam.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you and Roam (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) about using Roam, a tool for planning group trips. By
        signing in, you agree to them. Our{" "}
        <Link href="/privacy">privacy policy</Link> explains how we handle your
        information.
      </p>

      <h2>Who can use Roam</h2>
      <p>
        You must be at least {MINIMUM_AGE}. If you&apos;re under 18, or under
        the age of majority where you live, a parent or guardian must agree to
        these terms for you. You sign in with a Google account, and you&apos;re
        responsible for what happens under your account, so keep that Google
        account secure.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you add to Roam: trips, plans, ideas, notes, and so on. You
        give us permission to store it, show it to the members of the trips you
        add it to, and process it as needed to run Roam. That permission ends
        when the content is deleted, except for shared trip records that stay on
        a trip after you leave, as the privacy policy describes.
      </p>
      <p>
        Only add content you have the right to share. Don&apos;t add other
        people&apos;s personal information without their permission.
      </p>

      <h2>Trips, members, and invites</h2>
      <ul>
        <li>
          A trip&apos;s owner controls it. They can change members&apos; roles,
          remove members, revoke invite links, and delete the trip, which
          deletes everything in it for everyone.
        </li>
        <li>
          Anyone with a valid invite link can join a trip until the link expires
          or is revoked. You&apos;re responsible for who you share links with.
        </li>
        <li>
          Members can see each other&apos;s names, email addresses, travel
          profiles, and what they add to the trip.
        </li>
      </ul>

      <h2>Expenses</h2>
      <p>
        Roam helps a group keep track of who paid for what and who owes whom.
        It doesn&apos;t move money, isn&apos;t a payment or banking service, and
        isn&apos;t responsible for whether anyone pays. Balances are only as
        accurate as the amounts entered, so check them before settling up.
      </p>

      <h2>Plans and suggestions</h2>
      <p>
        Roam doesn&apos;t book travel or check whether plans are possible.
        Opening hours, prices, travel times, safety, accessibility, and
        allergens are up to you and the businesses involved. If AI suggestions
        are turned on for a trip, they can be wrong or out of date. Check
        anything important before relying on it.
      </p>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use Roam to:</p>
      <ul>
        <li>break the law, or help anyone else break it;</li>
        <li>harass, threaten, or impersonate anyone;</li>
        <li>share content that is hateful, sexually explicit, or infringes someone else&apos;s rights;</li>
        <li>send spam, or abuse invite links;</li>
        <li>
          get into trips or accounts you weren&apos;t invited to, or get around
          Roam&apos;s permissions or limits;
        </li>
        <li>
          scrape, overload, or interfere with Roam, or probe it for security
          weaknesses without our written permission.
        </li>
      </ul>

      <h2>Changes and availability</h2>
      <p>
        Roam is new and free. Features may change, and it may have bugs or
        downtime. We may change or stop offering Roam. If we shut it down,
        we&apos;ll try to give you notice first. Don&apos;t keep the only copy
        of anything important in Roam.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Roam and delete your account at any time from your{" "}
        <Link href="/account">account page</Link>. We may suspend or close
        accounts that break these terms or put other users at risk. Where
        reasonable, we&apos;ll tell you why.
      </p>

      <h2>Disclaimer</h2>
      <p>
        Roam is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To
        the fullest extent the law allows, we disclaim all warranties, express
        or implied, including warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We don&apos;t promise that
        Roam will be uninterrupted, error-free, or that data will never be lost.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, we aren&apos;t liable for any
        indirect, incidental, special, consequential, or punitive damages, or
        for lost profits, data, or trips, arising from your use of Roam. Our
        total liability for any claim about Roam is limited to $50. Some places
        don&apos;t allow these limits, so they may not all apply to you.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the State of California, without
        regard to its conflict-of-laws rules. Any dispute will be handled in the
        state or federal courts located in California, unless the law where you
        live gives you the right to bring it there. Nothing in these terms takes
        away consumer protections you have under the law where you live.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If we change these terms, we&apos;ll update the date at the top. For
        significant changes, we&apos;ll give you notice, for example in the app,
        before they take effect. If you keep using Roam after that, you accept
        the new terms. If you don&apos;t accept them, you can delete your
        account.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
