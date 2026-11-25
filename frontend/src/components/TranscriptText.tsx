import React from 'react'

// Highlights 7-15 digit phone numbers inline in monospace
const PHONE_REGEX = /(\+?\d[\d\s-]{6,14}\d)/g

export function TranscriptText({ text }: { text: string }) {
  const parts = text.split(PHONE_REGEX)
  return (
    <>
      {parts.map((part, idx) =>
        PHONE_REGEX.test(part) ? (
          <span
            key={idx}
            className="font-mono text-[12px] font-medium px-1.5 py-0.5 rounded bg-[#E7F1EE] dark:bg-[#1E332C] text-[#0F5C4D] dark:text-[#6EE7B7] mx-0.5"
          >
            {part}
          </span>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </>
  )
}
