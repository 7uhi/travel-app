import Link from "next/link";

import { ContactEmail, LegalPage } from "@/components/legal/LegalPage";
import { DELETED_USER_NAME } from "@/lib/account";
import { MINIMUM_AGE } from "@/lib/legal";

export const metadata = {
  title: "Privacy policy — Roam",
  description: "What Roam collects, who can see it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Roam is a tool for planning group trips. This policy explains what we
        collect when you use it, who can see it, and how to delete it.
        &ldquo;Roam&rdquo;, &ldquo;we&rdquo;, and &ldquo;us&rdquo; mean the
        people who run this service.
      </p>
      <p>
        <strong>The short version:</strong> we keep what you sign in with and
        what you add to Roam, so we can run the app and show it to the people on
        your trips. We don&apos;t sell your information, show ads, or use
        analytics or tracking cookies. You can delete your account at any time.
      </p>

      <h2>What we collect</h2>
      <h3>When you sign in with Google</h3>
      <ul>
        <li>Your name, email address, and profile photo.</li>
        <li>
          An ID that links your Google account to Roam, and the sign-in tokens
          Google issues. We only ask Google for this basic profile. We
          can&apos;t see your contacts, calendar, email, or files.
        </li>
      </ul>
      <h3>What you add</h3>
      <ul>
        <li>
          <strong>Your travel profile:</strong> pace, budget, daily rhythm,
          lodging style, interests, and any dietary or accessibility notes you
          write.
        </li>
        <li>
          <strong>Trips:</strong> titles, destinations, dates, itineraries,
          activities, ideas and votes, the days you&apos;re free, and your
          answers to each trip&apos;s questions.
        </li>
        <li>
          <strong>Money:</strong> expenses, how they&apos;re split, and
          repayments. Roam only records these amounts. It never handles real
          payments or asks for bank or card details.
        </li>
        <li>
          <strong>Packing:</strong> shared and personal packing lists, and the
          templates you save.
        </li>
        <li>
          <strong>Invites:</strong> the invite links you create.
        </li>
      </ul>
      <h3>Automatically</h3>
      <ul>
        <li>
          A cookie that keeps you signed in, plus the short-lived cookies the
          sign-in process needs. We don&apos;t use advertising or analytics
          cookies.
        </li>
        <li>
          Basic request logs kept by our hosting provider, such as your IP
          address, browser type, and the pages requested. They&apos;re used to
          keep the service running and secure.
        </li>
      </ul>

      <h2>Who can see it</h2>
      <p>
        <strong>The other members of your trips</strong> can see:
      </p>
      <ul>
        <li>Your name, email address, and profile photo.</li>
        <li>
          Your travel profile, <strong>including any dietary or accessibility
          notes</strong>. These notes can reveal health information, so only
          write what you&apos;re comfortable sharing with everyone on your trips.
        </li>
        <li>
          Everything you add to the trip, including your availability, your
          answers to the trip&apos;s questions, ideas you suggest, which ideas
          you voted for, and expenses and repayments involving you.
        </li>
      </ul>
      <p>
        <strong>Only you</strong> can see your personal packing list and your
        packing templates.
      </p>
      <p>
        Anyone with a valid invite link can join that trip and see what&apos;s in
        it, so share invite links only with people you mean to invite. Trip
        owners can revoke links and remove members.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and run Roam&apos;s features.</li>
        <li>To show your information to the members of your trips, as above.</li>
        <li>To keep Roam secure, prevent abuse, and fix problems.</li>
        <li>To reply when you contact us.</li>
      </ul>
      <p>
        We don&apos;t sell your information, share it for advertising, or use it
        to build profiles about you outside Roam.
      </p>

      <h2>AI suggestions</h2>
      <p>
        Roam has an optional feature that suggests activity ideas for a trip.
        Only a trip&apos;s owner can turn it on for that trip, after reading what
        it would use. Today the suggestions are generated within Roam itself,
        and no trip information is sent to an outside AI company. If we connect
        one in the future, we&apos;ll update this policy first and name the
        provider here. Dietary and accessibility notes, email addresses,
        expenses, packing lists, and who voted for what are never included.
      </p>

      <h2>Services we rely on</h2>
      <p>
        These companies process information on our behalf, only to provide
        their service:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the app and keeps its request logs.
        </li>
        <li>
          <strong>Supabase</strong> hosts our database, in the United States.
        </li>
        <li>
          <strong>Google</strong> handles sign-in. Your profile photo is loaded
          from Google&apos;s servers, so Google may see when someone views it.
        </li>
      </ul>
      <p>
        Your information is stored in the United States. We may also disclose
        information if the law requires it, or to protect the safety of our
        users or the public.
      </p>

      <h2>How long we keep it, and deleting it</h2>
      <p>
        We keep your information while you have an account. You can delete
        your account at any time from your{" "}
        <Link href="/account">account page</Link>. When you do:
      </p>
      <ul>
        <li>
          Your name, email address, photo, travel profile, and Google sign-in
          link are erased, and you&apos;re signed out everywhere.
        </li>
        <li>
          Trips where you were the only member are deleted. You leave every
          other trip, and your availability, trip answers, votes, personal
          packing list, and invite links are removed from them.
        </li>
        <li>
          Shared trip records, such as expenses, repayments, and ideas you
          suggested, stay on their trips so the other members&apos; plans and
          balances still add up. They show you as &ldquo;{DELETED_USER_NAME}
          &rdquo; instead of your name.
        </li>
      </ul>
      <p>
        When a trip owner deletes a trip, everything in it is deleted. Copies in
        our providers&apos; logs and any backups are removed on their regular
        schedules.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can see and change your travel profile at any time, and delete your
        account yourself. Depending on where you live, you may also have the
        right to get a copy of your information, correct it, or object to how we
        use it. Email us at <ContactEmail /> and we&apos;ll respond within 30
        days. We won&apos;t treat you differently for using these rights.
      </p>

      <h2>Security</h2>
      <p>
        Roam is served only over HTTPS. Access to the database is limited to
        the app and the people who run it. No service is perfectly secure, but
        if a breach affects your information, we&apos;ll tell you as the law
        requires.
      </p>

      <h2>Children</h2>
      <p>
        Roam isn&apos;t for anyone under {MINIMUM_AGE}. If we learn that someone
        under {MINIMUM_AGE} has an account, we&apos;ll delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top. For
        significant changes, we&apos;ll give you notice, for example in the app,
        before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
