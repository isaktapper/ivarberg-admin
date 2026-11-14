/** inu:s ordmärke (samma som i sajtens sidfot): staplarna följer textfärgen, fyrkanten är alltid limegrön. */
export function InuMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 7 147 85" aria-hidden="true" focusable="false" className={className}>
      <path d="M6.5 30V90M33.5 90V55a20 20 0 0 1 40 0V90M100.5 30v35a20 20 0 0 0 40 0V30" fill="none" stroke="currentColor" strokeWidth="13" />
      <rect x="0" y="9" width="13" height="13" fill="#C6F135" />
    </svg>
  )
}
