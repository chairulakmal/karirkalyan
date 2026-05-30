import Link from "next/link";
import { Mark, Wordmark } from "@/app/components/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <Mark size={40} />
          <Wordmark size="md" />
        </Link>
        <div className="bg-linen border border-dune p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
