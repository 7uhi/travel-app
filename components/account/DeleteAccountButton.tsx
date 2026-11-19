"use client";

import { useState, useTransition } from "react";

import { deleteMyAccount } from "@/actions/account";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui/form";

const dangerButtonClass =
  "rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50";

/**
 * Opens the final confirmation. Typing the phrase is the confirmation, and
 * deleteMyAccount checks it again on the server; on success it signs out and
 * redirects to the landing page.
 */
export function DeleteAccountButton({ confirmPhrase }: { confirmPhrase: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === confirmPhrase;

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await deleteMyAccount(typed);
      // Success redirects, so only a failure comes back here.
      if (result && !result.success) setError(result.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={dangerButtonClass}>
        Delete account
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This signs you out everywhere and can't be undone."
      >
        <form action={submit} className="space-y-4">
          <Field label={`Type ${confirmPhrase} to confirm`}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !matches}
              className={dangerButtonClass}
            >
              {pending ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
