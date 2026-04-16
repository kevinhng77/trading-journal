/** @type {readonly string[]} */
export const TRADE_NOTE_TEMPLATES = [
  `

---
· Focus:
· Mistakes:
· Tomorrow:
`,
  `

---
· Setup / thesis:
· Entry & exit:
· Emotional check:
`,
  `

---
· What worked:
· What didn’t:
· Rule for next session:
`,
  `

---
· Plan vs execution:
· Best decision:
· Worst decision:
`,
  `

---
· Context (levels / news):
· Risk taken:
· R (realized) & fees:
`,
];

export function pickRandomTradeNoteTemplate() {
  const i = Math.floor(Math.random() * TRADE_NOTE_TEMPLATES.length);
  return TRADE_NOTE_TEMPLATES[i];
}
