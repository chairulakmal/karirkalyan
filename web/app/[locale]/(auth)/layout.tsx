import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { Mark, Wordmark } from "@/app/components/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Mark size={40} />
            <Wordmark size="md" />
          </Link>
          <div className="text-sm">
            <LocaleSwitcher />
          </div>
        </div>
        {/* <main>, not a <div>: without it the sign-in form sat outside every
            landmark, so a screen-reader user navigating by landmark could not
            reach the app's front door at all. */}
        <main className="bg-linen border border-dune p-8 shadow-sm">{children}</main>
      </div>
    </div>
  );
}
