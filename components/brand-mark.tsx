import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export function BrandMark({
  size = 24,
  className,
  alt = "do.it",
  priority = false,
}: BrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-[22%] bg-[#12141A] ring-1 ring-foreground/10",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/icon.png"
        alt={alt}
        width={size}
        height={size}
        sizes={`${size}px`}
        className="size-full"
        priority={priority}
      />
    </span>
  );
}

export function BrandLockup({
  className,
  markSize = 22,
  priority = false,
}: {
  className?: string;
  markSize?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark size={markSize} alt="" priority={priority} />
      <span className="font-medium tracking-tight">do.it</span>
    </span>
  );
}
