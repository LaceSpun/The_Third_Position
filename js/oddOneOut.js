/*
  THE THIRD POSITION — Pattern Check offline fallback bank
  ---------------------------------------------------------
  This is the always-available content: three short stances, two of which
  share a real underlying logic and one of which doesn't. It's used whenever
  AI generation (js/groq.js, generateAITriad) is off, fails, or hasn't been
  set up — so the app is never dependent on a network call to function.

  Each entry:
    id             unique string, stable forever (never renumber)
    stances        exactly 3 short statements, in a fixed canonical order
                    (the app shuffles the display order at render time —
                    oddIndex always refers to this canonical array)
    oddIndex       index (0-2) of the stance that does NOT share the logic
    sharedLogic    short label for what the other two have in common
    explanation    one sentence, shown after the pick, on why

  To add more: append objects here. The two non-odd stances must share a
  real structural logic (intent vs outcome, rule vs exception, individual
  vs system, etc.), not just similar wording or topic — a good triad should
  still be a little hard even once you're looking for it.
*/

const ODD_ONE_OUT = [
  {
    id: "oo001",
    stances: [
      "A surgeon who saves the patient through a risky improvised technique deserves credit, even though he broke protocol to get there.",
      "A donor who gives to charity mainly for the tax benefit has still done something good, whatever the underlying reason.",
      "A student who cheats but happens to write down the correct answer hasn't actually demonstrated understanding.",
    ],
    oddIndex: 2,
    sharedLogic: "outcome over intent",
    explanation: "The first two judge the act by its outcome regardless of intent or method; the third judges the same correct outcome negatively because of how it was reached.",
  },
  {
    id: "oo002",
    stances: [
      "If one student turns in an essay a day late without penalty, fairness basically requires letting everyone.",
      "Once a judge grants one exception to a strict sentencing guideline, the guideline stops functioning as a guideline.",
      "Letting a lifelong friend break a plan on short notice, just this once, doesn't change what the friendship is built on.",
    ],
    oddIndex: 2,
    sharedLogic: "an exception here would collapse the rule",
    explanation: "The first two treat an exception as corrosive to the system it belongs to; the third treats an exception as harmless to the underlying structure.",
  },
  {
    id: "oo003",
    stances: [
      "You should propose to the person you love once you're confident, not once you're certain — certainty about another person never fully arrives.",
      "A doctor should start treatment based on the best current diagnosis rather than waiting for every test result to come back.",
      "A juror should hold out for reasonable doubt rather than convict on a merely persuasive case.",
    ],
    oddIndex: 2,
    sharedLogic: "committing now, on incomplete evidence, is the right call",
    explanation: "The first two favor acting on sufficient-but-incomplete evidence; the third favors withholding commitment until doubt is resolved.",
  },
  {
    id: "oo004",
    stances: [
      "An employee who cuts corners in an understaffed, overworked department is mostly a symptom of bad management, not a bad worker.",
      "A neighborhood's high crime rate says more about decades of disinvestment than about the character of the people living there.",
      "A cashier who's rude to every customer during a perfectly normal shift is just a rude person.",
    ],
    oddIndex: 2,
    sharedLogic: "blame lands on the system, not the individual",
    explanation: "The first two locate the cause in surrounding structural conditions; the third locates it squarely in the individual, with no comparable structural excuse offered.",
  },
  {
    id: "oo005",
    stances: [
      "Taking your friend's car keys when they're too drunk to drive is the right call even if they're furious about it.",
      "A parent should keep pushing a reluctant teenager toward therapy they clearly need, even against their protests.",
      "An adult child should let their aging parent keep living alone if that's genuinely what the parent wants, even if it's riskier.",
    ],
    oddIndex: 2,
    sharedLogic: "care justifies overriding the other person's stated wishes",
    explanation: "The first two override stated wishes for the person's own good; the third defers to stated wishes despite the risk.",
  },
  {
    id: "oo006",
    stances: [
      "New coworkers should be given real responsibility from day one, not slowly tested before anyone trusts them with anything.",
      "A stranger who returns your dropped wallet with nothing missing has earned the benefit of the doubt on anything else, for now.",
      "A contractor's first invoice should be checked line by line before anything gets paid out.",
    ],
    oddIndex: 2,
    sharedLogic: "trust is extended by default until proven otherwise",
    explanation: "The first two extend trust by default; the third withholds trust until it's been verified.",
  },
  {
    id: "oo007",
    stances: [
      "It's fine to accept a job offer while telling yourself you'll reassess honestly after six months.",
      "Moving in together can be a real commitment and still be something you agreed to revisit if it isn't working.",
      "Once you've made a public promise, changing your mind later means the promise wasn't real in the first place.",
    ],
    oddIndex: 2,
    sharedLogic: "commit now while explicitly keeping the door open to revise",
    explanation: "The first two pair commitment with built-in permission to revise; the third treats any later revision as proof the commitment was never genuine.",
  },
  {
    id: "oo008",
    stances: [
      "If a deal makes your stomach drop before you can articulate why, that unease is worth listening to.",
      "The instant discomfort you feel meeting someone is often picking up on something real, even before you can name it.",
      "The nervousness before a big presentation is just adrenaline, not information about whether you're prepared.",
    ],
    oddIndex: 2,
    sharedLogic: "the felt reaction is trustworthy evidence",
    explanation: "The first two treat a gut feeling as a real signal worth heeding; the third dismisses a comparable felt reaction as noise.",
  },
  {
    id: "oo009",
    stances: [
      "How formally you speak to your boss versus your closest friend isn't inconsistency — it's reading the room correctly.",
      "Whether you should offer unsolicited advice depends entirely on who's asking and what mood they're in, not on a fixed policy.",
      "If you're willing to be bluntly honest with one friend about a hard truth, you owe every friend that same bluntness, no matter the situation.",
    ],
    oddIndex: 2,
    sharedLogic: "the right move changes with context, not a fixed personal rule",
    explanation: "The first two calibrate behavior to context; the third applies one fixed rule across every context regardless.",
  },
  {
    id: "oo010",
    stances: [
      "Security footage shows what occurred; what it proves about who's at fault is a separate question the footage alone can't answer.",
      "A sales number going down tells you sales went down — why it went down is a completely different investigation.",
      "If someone cancels plans twice in a row, that pattern basically tells you they don't value your time.",
    ],
    oddIndex: 2,
    sharedLogic: "what happened is kept separate from what it means",
    explanation: "The first two insist on keeping the bare fact and its interpretation apart; the third collapses an observed pattern straight into a confident interpretation.",
  },
  {
    id: "oo011",
    stances: [
      "A recipe is the same dish whether a family invented it themselves or copied it from a stranger — what matters is what's on the plate.",
      "A bridge is safe or unsafe based on its current engineering, not on the reputation of the firm that originally built it.",
      "A wedding ring passed down through three generations means something a brand-new one from a store never could.",
    ],
    oddIndex: 2,
    sharedLogic: "what it's made of matters more than its history",
    explanation: "The first two judge by present function regardless of origin; the third locates the value specifically in origin and history.",
  },
  {
    id: "oo012",
    stances: [
      "An old family photo shouldn't be digitally touched up — the scratches are part of what it actually is now.",
      "A historic building's crooked floors shouldn't be leveled out during renovation; the unevenness is part of its history.",
      "A first draft of a novel should be rewritten as many times as it takes to make it good.",
    ],
    oddIndex: 2,
    sharedLogic: "the original should be left alone, not improved",
    explanation: "The first two preserve the flawed original as-is; the third actively expects the original to be revised into something better.",
  },
  {
    id: "oo013",
    stances: [
      "The best part of the trip was the day they threw out the itinerary and just wandered.",
      "The strongest scene an actor ever gave was the take where they abandoned the script and improvised the line.",
      "The project only came together because someone finally wrote a real schedule and stuck to it.",
    ],
    oddIndex: 2,
    sharedLogic: "the good result came from abandoning a plan, not following one",
    explanation: "The first two credit letting go of structure; the third credits imposing structure.",
  },
  {
    id: "oo014",
    stances: [
      "You back your teammate in the meeting even if you privately think their plan has a real flaw.",
      "You don't correct your best friend's exaggerated story in front of new people, even though a couple of details are wrong.",
      "You tell your business partner their numbers are off, even knowing it'll embarrass them in front of the investors.",
    ],
    oddIndex: 2,
    sharedLogic: "standing by someone outweighs what's technically accurate",
    explanation: "The first two prioritize loyalty over correcting the record; the third prioritizes correcting the record over sparing the partner.",
  },
  {
    id: "oo015",
    stances: [
      "The intern who made one small error in a group project shouldn't be blamed as much as the lead who signed off on the whole thing.",
      "A driver going 2 mph over the limit shouldn't be fined the same as one going 40 over.",
      "Anyone on the team when the deadline was missed should face the exact same consequence, regardless of their actual role in it.",
    ],
    oddIndex: 2,
    sharedLogic: "the response is scaled to how much someone actually contributed",
    explanation: "The first two scale the response to actual contribution; the third applies a flat, uniform consequence regardless of contribution.",
  },
  {
    id: "oo016",
    stances: [
      "A 'no outside food' hospital policy obviously isn't meant to stop a parent from bringing formula for their baby.",
      "A deadline rule meant to keep grading fair shouldn't be used to fail someone whose flight was cancelled the night before.",
      "The contract says net-30, so payment on day 31 is officially late, full stop, no matter the reason.",
    ],
    oddIndex: 2,
    sharedLogic: "the point of the rule outweighs its literal wording",
    explanation: "The first two bend the literal rule to serve the purpose behind it; the third enforces the literal wording regardless of purpose.",
  },
  {
    id: "oo017",
    stances: [
      "If you'd criticize a coworker for missing a deadline, you should hold yourself to that same standard when you miss one.",
      "The ethical rule you'd apply to a stranger's situation should apply to your own, even when it's inconvenient.",
      "You understand your own circumstances in a way no one judging you from outside ever could, so your case is different.",
    ],
    oddIndex: 2,
    sharedLogic: "the same standard applies to everyone, including yourself",
    explanation: "The first two apply one standard universally, including to themselves; the third claims a personal exemption based on privileged self-knowledge.",
  },
  {
    id: "oo018",
    stances: [
      "Someone who was a mess in their twenties and has spent a decade proving otherwise shouldn't be introduced by their worst year.",
      "A company that caused real harm a generation ago, under completely different leadership and practices, should be judged mainly on how it operates today.",
      "A public figure's old, deleted posts are still fair game, no matter how long ago they were written.",
    ],
    oddIndex: 2,
    sharedLogic: "who someone is now outweighs who they used to be",
    explanation: "The first two weight present change over the past; the third treats the past as still fully binding regardless of change.",
  },
];
