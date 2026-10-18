// app/icon.svg (파비콘) 와 같은 그림. 다크 바탕에 묻히지 않게 얇은 테두리를 두른다.
export default function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden className={`${className} rounded-[22%] ring-1 ring-line`}>
      <rect width="96" height="96" rx="22" fill="#111111" />
      <rect x="18" y="22" width="16" height="52" rx="4" fill="#F59E0B" />
      <rect x="40" y="22" width="16" height="52" rx="4" fill="#FFFFFF" />
      <rect x="62" y="22" width="16" height="52" rx="4" fill="#FFFFFF" fillOpacity="0.55" />
    </svg>
  );
}
