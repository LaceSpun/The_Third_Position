/* The fixed vocabulary of "moves" a third position can make.
   OTHER lets the user name a new mechanism, which is then tracked
   as its own category once it recurs. */

const MECHANISMS = [
  { id: "CONDITION", label: "Condition", hint: "A applies under X, B under Y" },
  { id: "THRESHOLD", label: "Threshold", hint: "the answer changes after some point" },
  { id: "SEQUENCE", label: "Sequence", hint: "A first, B later" },
  { id: "DIFFERENT_LEVELS", label: "Different Levels", hint: "both operate at different scales" },
  { id: "DIFFERENT_FUNCTIONS", label: "Different Functions", hint: "they solve different problems" },
  { id: "REVERSIBILITY", label: "Reversibility", hint: "commit while preserving revision" },
  { id: "CONTROL_AGENCY", label: "Control / Agency", hint: "the real distinction is who decides" },
  { id: "FEEDBACK_LOOP", label: "Feedback Loop", hint: "each prevents the excess of the other" },
  { id: "CONTEXT", label: "Context", hint: "environment changes the answer" },
  { id: "NEW_VARIABLE", label: "New Variable", hint: "A versus B was not the real distinction" },
  { id: "PRESERVE_CONTRADICTION", label: "Preserve Contradiction", hint: "the tension itself contains useful information" },
  { id: "OTHER", label: "Other", hint: "name a new mechanism" },
];

function mechanismLabel(id) {
  const m = MECHANISMS.find((m) => m.id === id);
  return m ? m.label : id;
}
