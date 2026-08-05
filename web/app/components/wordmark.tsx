import Image from "next/image";

export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <span className={`kk-wordmark ${cls}`}>
      karir<span className="kalyan">kalyan</span>
    </span>
  );
}

export function Mark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/brand/icons/karirkalyan-primary.svg"
      // Decorative, deliberately. Every call site pairs this with <Wordmark>,
      // which renders "karirkalyan" as real text at every width, so a real alt
      // here is the same name twice: screen readers announced "KarirKalyan
      // KarirKalyan" on all seven pages. <MonogramMark> below already got this
      // right. If this mark ever appears without the wordmark beside it, it
      // needs the name back.
      alt=""
      width={size}
      height={size}
      priority
    />
  );
}

export function MonogramMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      src="/brand/icons/karirkalyan-monogram.svg"
      alt=""
      width={size}
      height={size}
      priority
    />
  );
}
