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
      alt="KarirKalyan"
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
